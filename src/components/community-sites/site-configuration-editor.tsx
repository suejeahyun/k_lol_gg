"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { applyCommunityTemplate, COMMUNITY_HOME_SECTIONS, COMMUNITY_MODULE_CATALOG, COMMUNITY_TEMPLATES, CommunitySiteConfigurationError, setCommunitySiteModule, validateCommunitySiteConfig, type CommunityHomeSectionId, type CommunityModuleId, type CommunitySiteConfig } from "@/modules/community-sites/domain/site-configuration";
import { ConfigurationPreview } from "./configuration-preview";
import styles from "./site-configuration.module.css";

export type SiteConfigurationEditorProps = {
  configuration: CommunitySiteConfig;
  onChange: (configuration: CommunitySiteConfig) => void;
  disabled?: boolean;
  lockSlug?: boolean;
};

export function SiteConfigurationEditor({ configuration, onChange, disabled = false, lockSlug = false }: SiteConfigurationEditorProps) {
  const formId = useId();
  const [changeNotice, setChangeNotice] = useState("");
  const [pendingDisable, setPendingDisable] = useState<CommunityModuleId | null>(null);
  let validationError: CommunitySiteConfigurationError | null = null;
  try { validateCommunitySiteConfig(configuration); } catch (error) {
    if (error instanceof CommunitySiteConfigurationError) validationError = error;
  }
  function patch(values: Partial<CommunitySiteConfig>) { onChange({ ...configuration, ...values }); }
  function moveSection(id: CommunityHomeSectionId, direction: -1 | 1) {
    const homeSections = [...configuration.homeSections];
    const position = homeSections.indexOf(id);
    const target = position + direction;
    if (position < 0 || target < 0 || target >= homeSections.length) return;
    [homeSections[position], homeSections[target]] = [homeSections[target], homeSections[position]];
    patch({ homeSections });
  }
  const fieldError = (field: string) => validationError?.field === field;
  function toggleModule(id: CommunityModuleId, enabled: boolean) {
    const next = setCommunitySiteModule(configuration, id, enabled);
    onChange(next);
    const changed = COMMUNITY_MODULE_CATALOG.filter((item) => next.modules[item.id] !== configuration.modules[item.id]).map((item) => item.label).join(", ");
    setChangeNotice(`${changed} ${enabled ? "사용 설정을 켰습니다. 필요한 기능도 함께 켜집니다." : "사용 설정을 껐습니다. 기존 자료는 유지됩니다."}`);
    setPendingDisable(null);
  }
  return (
    <div className={styles.editor}>
      <div className={styles.editorFields}>
        <Card><CardHeader><CardTitle>커뮤니티의 첫인상</CardTitle></CardHeader><CardContent>
          <fieldset className={styles.fieldset} disabled={disabled}>
            <legend className={styles.srOnly}>커뮤니티 기본 정보</legend>
            <label className={styles.field} htmlFor={`${formId}-name`}><span>커뮤니티 이름</span>
              <Input id={`${formId}-name`} value={configuration.name} onChange={(event) => patch({ name: event.target.value })} minLength={2} maxLength={80} required aria-invalid={fieldError("name")} />
            </label>
            <label className={styles.field} htmlFor={`${formId}-slug`}><span>사이트 식별 주소</span>
              <Input id={`${formId}-slug`} value={configuration.slug} onChange={(event) => patch({ slug: event.target.value })} disabled={lockSlug} minLength={3} maxLength={40} pattern="[a-zA-Z][a-zA-Z0-9]*(-[a-zA-Z0-9]+)*" autoCapitalize="none" spellCheck={false} required aria-invalid={fieldError("slug")} aria-describedby={`${formId}-slug-help`} />
              <small id={`${formId}-slug-help`}>{lockSlug ? "개설 후 주소는 변경할 수 없습니다." : "영문·숫자·하이픈 3~40자. 실제 배포 주소는 개설 과정에서 확인됩니다."}</small>
            </label>
            <label className={styles.field} htmlFor={`${formId}-description`}><span>소개</span>
              <Input id={`${formId}-description`} value={configuration.description} onChange={(event) => patch({ description: event.target.value })} maxLength={300} aria-invalid={fieldError("description")} />
              <small>최대 300자. 모든 테마에서 같은 소개를 사용합니다.</small>
            </label>
          </fieldset>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>세 가지 테마</CardTitle><p className={styles.help}>이름·색상·회원·기록은 유지됩니다. 테마를 선택하면 홈 배치가 해당 테마의 기본 순서로 바뀝니다.</p></CardHeader><CardContent>
          <fieldset className={styles.templateChoices} disabled={disabled}>
            <legend className={styles.srOnly}>홈 테마 선택</legend>
            {COMMUNITY_TEMPLATES.map((template) => <label className={styles.templateChoice} data-selected={configuration.templateId === template.id} key={template.id}>
              <input type="radio" name={`${formId}-template`} value={template.id} checked={configuration.templateId === template.id} onChange={() => { onChange(applyCommunityTemplate(configuration, template.id)); setChangeNotice(`${template.name} 홈 배치를 적용했습니다. 기존 자료와 색상은 유지됩니다.`); }} />
              <span className={styles.templateSwatch} data-template={template.id} aria-hidden="true"><i /><i /><i /></span>
              <strong>{template.name}</strong><span>{template.subtitle}</span><small>{template.description}</small>
            </label>)}
          </fieldset>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>색상과 이미지</CardTitle></CardHeader><CardContent>
          <fieldset className={styles.fieldset} disabled={disabled}>
            <legend className={styles.srOnly}>브랜드 설정</legend>
            <div className={styles.field}><label htmlFor={`${formId}-color`}>대표 색상</label><div className={styles.colorInputs}>
              <input aria-label="색상표에서 대표 색상 선택" type="color" value={/^#[\da-f]{6}$/i.test(configuration.primaryColor) ? configuration.primaryColor : "#536DFE"} onChange={(event) => patch({ primaryColor: event.target.value })} />
              <Input id={`${formId}-color`} value={configuration.primaryColor} onChange={(event) => patch({ primaryColor: event.target.value })} pattern="#[a-fA-F0-9]{6}" maxLength={7} required aria-invalid={fieldError("primaryColor")} />
            </div><small>버튼 글자는 배경색에 맞게 밝거나 어둡게 자동 조정됩니다.</small></div>
            <label className={styles.field} htmlFor={`${formId}-logo`}><span>로고 이미지 주소</span><Input id={`${formId}-logo`} type="url" value={configuration.logoUrl ?? ""} onChange={(event) => patch({ logoUrl: event.target.value || null })} placeholder="https://…" maxLength={2000} aria-invalid={fieldError("logoUrl")} /><small>정사각형 이미지를 권장합니다. 비워 두면 이름의 첫 글자를 사용합니다.</small></label>
            <label className={styles.field} htmlFor={`${formId}-banner`}><span>배너 이미지 주소</span><Input id={`${formId}-banner`} type="url" value={configuration.bannerUrl ?? ""} onChange={(event) => patch({ bannerUrl: event.target.value || null })} placeholder="https://…" maxLength={2000} aria-invalid={fieldError("bannerUrl")} /><small>공개 HTTPS 이미지 주소만 사용할 수 있습니다. 배너는 화면에 맞춰 잘릴 수 있습니다.</small></label>
          </fieldset>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>사용할 기능</CardTitle><p className={styles.help}>기능을 꺼도 원본 자료는 삭제하지 않습니다. 신규 접수와 메뉴를 중지하고, 기존 기록 확인·취소·운영진 마무리는 유지합니다. 다시 켜면 사용할 수 있습니다.</p></CardHeader><CardContent>
          <fieldset className={styles.moduleChoices} disabled={disabled}>
            <legend className={styles.srOnly}>기능 사용 여부</legend>
            {COMMUNITY_MODULE_CATALOG.map((module) => <div className={styles.moduleChoice} key={module.id}>
              <label><input type="checkbox" checked={configuration.modules[module.id]} disabled={module.required || disabled || module.id === "riotIntegration"} onChange={(event) => {
                const enabled = event.target.checked;
                if (enabled) toggleModule(module.id, true);
                else setPendingDisable(module.id);
              }} aria-describedby={`${formId}-module-${module.id}`} /><span><strong>{module.label}</strong>{module.required && <span className={styles.requiredBadge}>기본·필수</span>}<span className={styles.moduleDescription}>{module.description}</span></span></label>
              <p id={`${formId}-module-${module.id}`} className={styles.moduleNote}>{module.disableImpact}</p>
              {module.dependencies.some((dependency) => dependency !== "members") && <p className={styles.moduleNote}>필요한 기능: {module.dependencies.map((id) => COMMUNITY_MODULE_CATALOG.find((item) => item.id === id)!.label).join(", ")}</p>}
              {module.setupNote && <p className={styles.setupNote}>{module.setupNote}</p>}
              {module.id === "riotIntegration" && <p className={styles.setupNote}>새 사이트의 Riot 연결은 준비 중입니다. 현재는 선택할 수 없습니다.</p>}
              {pendingDisable === module.id && <div className={styles.disableConfirmation} role="group" aria-label={`${module.label} 끄기 영향 확인`}>
                <strong>{module.label} 기능을 끄기 전에 확인해 주세요.</strong>
                <p>{module.disableImpact} 자료는 삭제하지 않으며 다시 켤 수 있습니다. 실제 사이트에는 설정을 게시한 뒤 적용됩니다.</p>
                <div><Button type="button" variant="destructive" disabled={disabled} onClick={() => toggleModule(module.id, false)}>확인하고 기능 끄기</Button><Button type="button" variant="outline" disabled={disabled} onClick={() => setPendingDisable(null)}>켜 둔 상태 유지</Button></div>
              </div>}
            </div>)}
          </fieldset>
          <p className={styles.futureNote}>사이트 간 제휴·운영 기록 공유·공동 대회는 후속 개발 범위이며, 여기에서 켤 수 있는 기능에 포함되지 않습니다.</p>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>홈 구성과 순서</CardTitle><p className={styles.help}>표시할 블록을 선택하고 순서를 바꿀 수 있습니다. 꺼진 기능의 배치도 보관해 다시 켤 때 복원합니다.</p></CardHeader><CardContent>
          <fieldset className={styles.homeChoices} disabled={disabled}>
            <legend className={styles.srOnly}>홈 블록 선택과 순서</legend>
            {[...configuration.homeSections, ...COMMUNITY_HOME_SECTIONS.map((section) => section.id).filter((id) => !configuration.homeSections.includes(id))].map((id) => {
              const section = COMMUNITY_HOME_SECTIONS.find((item) => item.id === id)!;
              const position = configuration.homeSections.indexOf(id);
              const enabled = !section.module || configuration.modules[section.module];
              return <div className={styles.homeChoice} key={id}>
                <label><input type="checkbox" checked={position >= 0} disabled={disabled || id === "introduction"} onChange={(event) => patch({ homeSections: event.target.checked ? [...configuration.homeSections, id] : configuration.homeSections.filter((item) => item !== id) })} /><span>{section.label}{!enabled && <small>기능 꺼짐 · 게시 시 숨김</small>}{id === "introduction" && <small>필수</small>}</span></label>
                <div className={styles.orderButtons}>
                  <Button type="button" variant="outline" size="icon" aria-label={`${section.label} 위로 이동`} disabled={disabled || position <= 0} onClick={() => moveSection(id, -1)}>↑</Button>
                  <Button type="button" variant="outline" size="icon" aria-label={`${section.label} 아래로 이동`} disabled={disabled || position < 0 || position === configuration.homeSections.length - 1} onClick={() => moveSection(id, 1)}>↓</Button>
                </div>
              </div>;
            })}
          </fieldset>
        </CardContent></Card>
        {validationError && <p className={styles.validationError} role="status">{validationError.reason}</p>}
        <p className={styles.changeNotice} role="status" aria-live="polite">{changeNotice}</p>
      </div>
      <aside className={styles.previewColumn}>
        <div className={styles.previewSticky}><div className={styles.previewTitle}><strong>홈 미리보기</strong><span>저장·게시 전 초안</span></div><ConfigurationPreview configuration={configuration} /><p className={styles.help}>미리보기의 메뉴와 버튼은 이동하지 않습니다. 저장·게시 동작은 화면 하단의 버튼으로 진행해 주세요.</p></div>
      </aside>
    </div>
  );
}
