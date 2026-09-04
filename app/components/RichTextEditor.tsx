"use client";

import { useEffect, useRef } from "react";

type Props={value:string;onChange:(value:string)=>void;placeholder?:string;minHeight?:number};

const allowedTags=new Set(["P","BR","STRONG","B","EM","I","UL","OL","LI","H2","H3"]);

function sanitizeHtml(html:string){
  if(typeof window==="undefined")return html;
  const doc=new DOMParser().parseFromString(`<div>${html}</div>`,"text/html");
  const root=doc.body.firstElementChild as HTMLElement|null;
  if(!root)return "";
  const walk=(node:Node)=>{
    [...node.childNodes].forEach(child=>{
      if(child.nodeType===Node.ELEMENT_NODE){
        const el=child as HTMLElement;
        if(!allowedTags.has(el.tagName)){
          const replacement=doc.createElement(el.tagName==="DIV"?"p":"span");
          while(el.firstChild)replacement.appendChild(el.firstChild);
          el.replaceWith(replacement);
          if(replacement.tagName==="SPAN")replacement.replaceWith(...replacement.childNodes);
          else walk(replacement);
          return;
        }
        [...el.attributes].forEach(a=>el.removeAttribute(a.name));
        walk(el);
      }
    });
  };
  walk(root);
  return root.innerHTML;
}

export function RichTextEditor({value,onChange,placeholder="Paste or type the job description here...",minHeight=260}:Props){
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(ref.current&&ref.current.innerHTML!==value)ref.current.innerHTML=value},[value]);

  function command(cmd:string,arg?:string){
    ref.current?.focus();
    document.execCommand(cmd,false,arg);
    if(ref.current)onChange(sanitizeHtml(ref.current.innerHTML));
  }

  return <div className="mt-2 overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-slate-600">
    <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50 p-2">
      <button type="button" onClick={()=>command("bold")} className="rounded border bg-white px-3 py-1.5 text-sm font-bold">B</button>
      <button type="button" onClick={()=>command("italic")} className="rounded border bg-white px-3 py-1.5 text-sm italic">I</button>
      <button type="button" onClick={()=>command("insertUnorderedList")} className="rounded border bg-white px-3 py-1.5 text-sm font-semibold">• Bullets</button>
      <button type="button" onClick={()=>command("insertOrderedList")} className="rounded border bg-white px-3 py-1.5 text-sm font-semibold">1. Numbered</button>
      <button type="button" onClick={()=>command("formatBlock","H2")} className="rounded border bg-white px-3 py-1.5 text-sm font-semibold">Heading</button>
      <button type="button" onClick={()=>command("formatBlock","P")} className="rounded border bg-white px-3 py-1.5 text-sm">Normal</button>
      <button type="button" onClick={()=>command("removeFormat")} className="rounded border bg-white px-3 py-1.5 text-sm">Clear</button>
    </div>
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={e=>onChange(sanitizeHtml(e.currentTarget.innerHTML))}
      onPaste={e=>{
        e.preventDefault();
        const html=e.clipboardData.getData("text/html");
        const text=e.clipboardData.getData("text/plain");
        document.execCommand("insertHTML",false,html?sanitizeHtml(html):text.replace(/\n/g,"<br>"));
        if(ref.current)onChange(sanitizeHtml(ref.current.innerHTML));
      }}
      style={{minHeight}}
      className="px-4 py-3 text-slate-900 outline-none empty:before:pointer-events-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)] [&_h2]:mt-5 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-bold [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6"
    />
  </div>
}

export function sanitizeRichTextForSave(html:string){return sanitizeHtml(html)}
