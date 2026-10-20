/* eslint-disable @typescript-eslint/no-require-imports -- Node's test runner executes transpiled TSX with synthetic services. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://fixture.test/candidates/import",
});
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
Object.defineProperty(global, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
const React = require("react");
const {
  render,
  fireEvent,
  waitFor,
  cleanup,
  within,
} = require("@testing-library/react");
test.afterEach(cleanup);

function load(file, bindings = {}, globals = {}) {
  const code = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  const loadedModule = { exports: {} };
  vm.runInNewContext(code, {
    module: loadedModule,
    exports: loadedModule.exports,
    require: (name) => bindings[name] || require(name),
    window,
    document,
    URLSearchParams,
    crypto,
    File,
    FormData,
    AbortSignal,
    Error,
    console,
    ...globals,
  });
  return loadedModule.exports;
}
const fixture = (name = "alice.pdf") =>
  new File(["Synthetic CV only"], name, {
    type: "application/pdf",
    lastModified: 1,
  });
const detail = (email = "alice@example.test") => ({
  candidate_name: "Synthetic Alice",
  email,
  phone: "",
  location: "Fixture City",
});

function services(options = {}) {
  const state = {
    existing: options.existing || [],
    inserts: [],
    uploads: [],
    removed: [],
    reads: [],
    checks: 0,
  };
  const client = {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "synthetic-token" } },
      }),
    },
    from(table) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          if (table === "jobs")
            return Promise.resolve({
              data: [
                { id: "job-1", title: "Synthetic analyst", status: "open" },
              ],
            });
          return this;
        },
        single: async () => ({
          data: { id: "job-1", status: options.closed ? "closed" : "open" },
        }),
        range: async (start, end) => {
          state.checks++;
          if (options.checkError) return { error: { message: "mock denial" } };
          return { data: state.existing.slice(start, end + 1) };
        },
        insert: async (value) => {
          state.inserts.push(value);
          if (options.uncertain) throw new Error("Lost response");
          if (options.failEmail === value.email)
            return { error: { code: "23505" } };
          state.existing.push({
            id: `saved-${state.inserts.length}`,
            email: value.email,
          });
          return { error: null };
        },
      };
    },
    storage: {
      from: () => ({
        upload: async (path, file, settings) => {
          state.uploads.push({ path, file, settings });
          return {
            error: options.uploadError
              ? { message: "Mock upload error" }
              : null,
          };
        },
        remove: async (paths) => {
          state.removed.push(...paths);
          return { error: null };
        },
      }),
    },
  };
  const fetch = async (url, init) => {
    assert.equal(url, "/api/extract-candidate");
    assert.equal(init.headers.Authorization, "Bearer synthetic-token");
    const file = init.body.get("cv");
    state.reads.push(file.name);
    if (file.name.startsWith("fail"))
      return Response.json(
        { error: "Synthetic extraction failure" },
        { status: 502 },
      );
    return Response.json(
      detail(
        file.name.startsWith("bob") ? "bob@example.test" : "alice@example.test",
      ),
    );
  };
  const lib = load("lib/bulk-cv-import.ts", {}, { fetch });
  const Component = load("components/bulk-cv-import.tsx", {
    "@/lib/supabase/client": { createClient: () => client },
    "@/lib/bulk-cv-import": lib,
  }).default;
  return { state, client, lib, Component };
}
async function open(options) {
  const mock = services(options);
  const ui = render(React.createElement(mock.Component));
  const job = ui.getByLabelText("Job for this batch");
  await waitFor(() => assert.equal(job.disabled, false));
  fireEvent.change(job, { target: { value: "job-1" } });
  return { ...mock, ui, job };
}
const pick = (ui, files) =>
  fireEvent.change(ui.getByLabelText("Choose downloaded CVs"), {
    target: { files },
  });
const section = (ui, name) => within(ui.getByRole("region", { name }));
async function read(ui) {
  fireEvent.click(ui.getByRole("button", { name: "Read queued CVs" }));
  await waitFor(() =>
    assert.equal(
      ui.getByRole("button", { name: "Refresh duplicate checks" }).disabled,
      false,
    ),
  );
}
function review(ui, name) {
  fireEvent.click(
    section(ui, name).getByRole("checkbox", { name: /I have checked/ }),
  );
}

test("multi-file picker → extraction → explicit review → original CV and attributed records", async () => {
  const { ui, state, job } = await open();
  const files = [fixture(), fixture("bob.docx")];
  pick(ui, files);
  assert.equal(job.disabled, true);
  assert.equal(state.inserts.length, 0);
  await read(ui);
  assert.deepEqual(state.reads, ["alice.pdf", "bob.docx"]);
  assert.equal(
    ui.getByRole("button", { name: /Import 0 reviewed/ }).disabled,
    true,
  );
  review(ui, "alice.pdf");
  review(ui, "bob.docx");
  fireEvent.click(ui.getByRole("button", { name: /Import 2 reviewed/ }));
  await waitFor(() =>
    assert.equal(ui.getAllByText(/Imported\. Source:/).length, 2),
  );
  assert.equal(state.inserts.length, 2);
  assert.equal(state.uploads[0].file, files[0]);
  assert.equal(state.uploads[0].settings.upsert, false);
  for (const value of state.inserts) {
    assert.equal(value.job_id, "job-1");
    assert.equal(value.popia_consent, false);
    assert.equal(value.popia_consent_at, null);
    assert.match(value.recruiter_notes, /LinkedIn Easy Apply/);
    assert.equal(value.status, "applied");
  }
  fireEvent.click(ui.getByRole("button", { name: "Refresh duplicate checks" }));
  await waitFor(() =>
    assert.equal(
      ui.getByRole("button", { name: "Refresh duplicate checks" }).disabled,
      false,
    ),
  );
  assert.equal(
    ui.getByRole("button", { name: /Import 0 reviewed/ }).disabled,
    true,
  );
});

test("drop validates individual files, repeat files and batch count without reading invalid CVs", async () => {
  const { ui, state } = await open();
  const file = fixture();
  fireEvent.drop(ui.getByText("Drop downloaded CVs here").parentElement, {
    dataTransfer: {
      files: [
        file,
        file,
        new File(["x"], "bad.exe", { type: "application/octet-stream" }),
      ],
    },
  });
  assert.match(ui.getByText(/already queued/).textContent, /bad.exe/);
  assert.equal(ui.getAllByRole("region").length, 1);
  pick(
    ui,
    Array.from({ length: 25 }, (_, n) => fixture(`file-${n}.pdf`)),
  );
  assert.ok(ui.getByText(/Use up to 25 files/));
  assert.equal(state.reads.length, 0);
});

test("batch and existing same-job duplicates require explicit override and review; never overwrite", async () => {
  const { ui, state } = await open({
    existing: [{ id: "old", email: " ALICE@EXAMPLE.TEST " }],
  });
  pick(ui, [fixture(), fixture("copy.pdf")]);
  await read(ui);
  for (const name of ["alice.pdf", "copy.pdf"]) {
    const row = section(ui, name);
    assert.ok(row.getByText(/elsewhere in this batch/));
    assert.ok(row.getByText(/already exists for this job/));
    assert.equal(
      row.getByRole("checkbox", { name: /I have checked/ }).disabled,
      true,
    );
  }
  fireEvent.click(
    section(ui, "alice.pdf").getByRole("checkbox", {
      name: /Create a separate/,
    }),
  );
  review(ui, "alice.pdf");
  fireEvent.click(ui.getByRole("button", { name: /Import 1 reviewed/ }));
  await waitFor(() => assert.ok(ui.getByText(/Imported\. Source:/)));
  assert.equal(state.inserts.length, 1);
  assert.equal(state.existing[0].id, "old");
});

test("failed extraction remains editable; failed duplicate query blocks saving until recovered", async () => {
  const options = { checkError: true };
  const { ui, state } = await open(options);
  pick(ui, [fixture("fail.pdf")]);
  await read(ui);
  assert.ok(section(ui, "fail.pdf").getByText(/Synthetic extraction failure/));
  fireEvent.change(section(ui, "fail.pdf").getByLabelText("Candidate name"), {
    target: { value: "Manual Synthetic" },
  });
  fireEvent.change(section(ui, "fail.pdf").getByLabelText("Email"), {
    target: { value: "manual@example.test" },
  });
  review(ui, "fail.pdf");
  assert.equal(
    ui.getByRole("button", { name: /Import 1 reviewed/ }).disabled,
    true,
  );
  options.checkError = false;
  fireEvent.click(ui.getByRole("button", { name: "Refresh duplicate checks" }));
  await waitFor(() =>
    assert.equal(
      ui.getByRole("button", { name: /Import 1 reviewed/ }).disabled,
      false,
    ),
  );
  fireEvent.click(ui.getByRole("button", { name: /Import 1 reviewed/ }));
  await waitFor(() => assert.ok(ui.getByText(/Imported\. Source:/)));
  assert.equal(state.inserts[0].candidate_name, "Manual Synthetic");
});

test("new duplicate discovered at save requires renewed approval without writing", async () => {
  const { ui, state } = await open();
  pick(ui, [fixture()]);
  await read(ui);
  review(ui, "alice.pdf");
  state.existing.push({ id: "concurrent", email: "alice@example.test" });
  fireEvent.click(ui.getByRole("button", { name: /Import 1 reviewed/ }));
  await waitFor(() => assert.ok(ui.getByText(/A new matching application/)));
  assert.equal(state.inserts.length, 0);
  assert.equal(
    section(ui, "alice.pdf").getByRole("checkbox", { name: /I have checked/ })
      .checked,
    false,
  );
});

test("partial failure retains edits, cleans rejected upload, and retries only the failed row", async () => {
  const options = { failEmail: "bob@example.test" };
  const { ui, state } = await open(options);
  pick(ui, [fixture(), fixture("bob.pdf")]);
  await read(ui);
  review(ui, "alice.pdf");
  review(ui, "bob.pdf");
  fireEvent.click(ui.getByRole("button", { name: /Import 2 reviewed/ }));
  await waitFor(() => assert.ok(ui.getByText(/Application was not added/)));
  assert.equal(state.removed.length, 1);
  assert.equal(
    section(ui, "bob.pdf").getByLabelText("Email").value,
    "bob@example.test",
  );
  options.failEmail = null;
  fireEvent.click(ui.getByRole("button", { name: "Refresh duplicate checks" }));
  await waitFor(() =>
    assert.equal(
      ui.getByRole("button", { name: "Refresh duplicate checks" }).disabled,
      false,
    ),
  );
  review(ui, "bob.pdf");
  fireEvent.click(ui.getByRole("button", { name: /Import 1 reviewed/ }));
  await waitFor(() =>
    assert.equal(ui.getAllByText(/Imported\. Source:/).length, 2),
  );
  assert.equal(
    state.inserts.filter((row) => row.email === "alice@example.test").length,
    1,
  );
});

test("uncertain write keeps original and blocks retry; a closed job never uploads", async () => {
  const { ui, state } = await open({ uncertain: true });
  pick(ui, [fixture()]);
  await read(ui);
  review(ui, "alice.pdf");
  fireEvent.click(ui.getByRole("button", { name: /Import 1 reviewed/ }));
  await waitFor(() => assert.ok(ui.getByText(/Save outcome is uncertain/)));
  assert.equal(state.removed.length, 0);
  assert.equal(
    section(ui, "alice.pdf").queryByRole("button", { name: "Retry reading" }),
    null,
  );
  cleanup();
  const closed = await open({ closed: true });
  pick(closed.ui, [fixture()]);
  await read(closed.ui);
  review(closed.ui, "alice.pdf");
  fireEvent.click(closed.ui.getByRole("button", { name: /Import 1 reviewed/ }));
  await waitFor(() => assert.ok(closed.ui.getByText(/no longer available/)));
  assert.equal(closed.state.uploads.length, 0);
});

test("duplicate scan pages past 500 rows; normalization and size limits are enforced", async () => {
  const mock = services({
    existing: Array.from({ length: 501 }, (_, i) => ({
      id: String(i),
      email: `fixture${i}@example.test`,
    })),
  });
  assert.equal((await mock.lib.loadExisting(mock.client, "job-1")).length, 501);
  assert.equal(mock.state.checks, 2);
  assert.equal(
    mock.lib.duplicateWarnings(" A@EXAMPLE.TEST ", ["a@example.test"], [])
      .length,
    1,
  );
  assert.ok(
    mock.lib.validateCv(new File([], "empty.pdf", { type: "application/pdf" })),
  );
  assert.ok(
    mock.lib.validateCv(
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.pdf", {
        type: "application/pdf",
      }),
    ),
  );
});
