"use client";

import { useEffect, useRef } from "react";

type Props={value:string;onChange:(value:string)=>void;placeholder?:string;minHeight?:number};

const allowedTags=new Set(["P","BR","STRONG","B","EM","I","UL","OL","LI","H2","H3"]);
const dropTags=new Set(["STYLE","SCRIPT","META","LINK","TITLE","HEAD","XML"]);

function stripOfficeNoiseFromText(text:string){
  return text
    .replace(/<!--[^]*?-->/g,"")
    .replace(/\/\*\s*Font Definitions\s*\*\/[^]*?(?=(?:\n\s*\n)|$)/gi,"")
    .replace(/@font-face\s*\{[^}]*\}/gi,"")
    .replace(/(?:p|div|span)\.[A-Za-z0-9_-]+\s*\{[^}]*\}/gi,"")
    .trim();
}

function sanitizeHtml(html:string){
  if(typeof window==="undefined")return html;
  const doc=new DOMParser().parseFromString(`<div>${html}</div>`,"text/html");
  const root=doc.body.firstElementChild as HTMLElement|null;
  if(!root)return "";

  const walk=(node:Node)=>{
    [...node.childNodes].forEach(child=>{
      if(child.nodeType===Node.COMMENT_NODE){
        child.remove();
        return;
      }

      if(child.nodeType===Node.TEXT_NODE){
        const cleaned=stripOfficeNoiseFromText(child.textContent||"");
        if(cleaned!==child.textContent)child.textContent=cleaned;
        return;
      }

      if(child.nodeType===Node.ELEMENT_NODE){
        const el=child as HTMLElement;

        if(dropTags.has(el.tagName)){
          el.remove();
          return;
        }

        if(!allowedTags.has(el.tagName)){
          walk(el);
          el.replaceWith(...el.childNodes);
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

function plainTextToHtml(text:string){
  const cleaned=stripOfficeNoiseFromText(text);
  const div=document.createElement("div");
  div.textContent=cleaned;
  return div.innerHTML.replace(/\r?\n/g,"<br>");
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
        const cleaned=html?sanitizeHtml(html):plainTextToHtml(text);
        document.execCommand("insertHTML",false,cleaned);
        if(ref.current){
          const normalized=sanitizeHtml(ref.current.innerHTML);
          ref.current.innerHTML=normalized;
          onChange(normalized);
        }
      }}
      style={{minHeight}}
      className="px-4 py-3 text-slate-900 outline-none empty:before:pointer-events-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)] [&_h2]:mt-5 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-bold [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6"
    />
  </div>
}

export function sanitizeRichTextForSave(html:string){return sanitizeHtml(html)}
