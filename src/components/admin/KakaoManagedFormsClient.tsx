"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Field = { key: string; label: string; placeholder?: string; required: boolean; type: string; options?: string[] };
type FormValue = { formType: string; title: string; instructions: string; commandAliases: string[]; fields: Field[] };
type TemplateRow = { id: number; formType: string; version: number; status: string; title: string; updatedAt: string };

function Editor({ value }: { value: FormValue }) {
  const router = useRouter();
  const [title, setTitle] = useState(value.title);
  const [instructions, setInstructions] = useState(value.instructions);
  const [aliases, setAliases] = useState(value.commandAliases.join(", "));
  const [fields, setFields] = useState(JSON.stringify(value.fields, null, 2));
  const [busy, setBusy] = useState(false);
  async function save() {
    let parsedFields: unknown;
    try { parsedFields = JSON.parse(fields); } catch { return window.alert("필드 JSON 형식을 확인해주세요."); }
    setBusy(true);
    const response = await fetch("/api/admin/kakao/form-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ formType: value.formType, title, instructions, commandAliases: aliases.split(",").map((item) => item.trim()).filter(Boolean), fields: parsedFields }) });
    const result = await response.json().catch(() => ({})) as { message?: string };
    setBusy(false);
    if (!response.ok) return window.alert(result.message || "저장에 실패했습니다.");
    window.alert("새 초안을 저장했습니다. 아래 이력에서 검토 후 게시하세요.");
    router.refresh();
  }
  return <section className="admin-card"><h2>{value.formType === "DISCIPLINE" ? "경고 양식" : "내전 결과 양식"}</h2><p>새 버전은 초안으로 저장됩니다. 게시 전까지 현재 카카오 양식은 바뀌지 않습니다.</p><label>제목<input value={title} onChange={(event) => setTitle(event.target.value)}/></label><label>명령어(쉼표 구분)<input value={aliases} onChange={(event) => setAliases(event.target.value)}/></label><label>안내 문구<textarea rows={7} value={instructions} onChange={(event) => setInstructions(event.target.value)}/></label><label>필드 JSON<textarea rows={18} value={fields} onChange={(event) => setFields(event.target.value)}/></label><button className="admin-button" disabled={busy} onClick={() => void save()}>{busy ? "저장 중..." : "새 초안 저장"}</button></section>;
}

export default function KakaoManagedFormsClient({ values, rows }: { values: FormValue[]; rows: TemplateRow[] }) {
  const router = useRouter();
  async function publish(id: number) {
    if (!window.confirm("이 버전을 카카오톡 봇의 현재 양식으로 게시할까요?")) return;
    const response = await fetch(`/api/admin/kakao/form-templates/${id}/publish`, { method: "POST" });
    if (!response.ok) return window.alert("게시하지 못했습니다.");
    router.refresh();
  }
  return <div style={{display:"grid",gap:20}}><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(360px,1fr))",gap:20}}>{values.map((value) => <Editor key={value.formType} value={value}/>)}</div><section className="admin-card"><h2>버전 이력</h2><div style={{overflowX:"auto"}}><table><thead><tr><th>종류</th><th>버전</th><th>상태</th><th>제목</th><th>수정일</th><th>게시</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.formType}</td><td>v{row.version}</td><td>{row.status}</td><td>{row.title}</td><td>{row.updatedAt}</td><td>{row.status !== "PUBLISHED" ? <button className="admin-button" onClick={() => void publish(row.id)}>게시</button> : "현재"}</td></tr>)}</tbody></table></div></section></div>;
}
