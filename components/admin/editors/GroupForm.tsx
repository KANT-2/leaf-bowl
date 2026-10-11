"use client";
import { Button } from "@/components/admin/button";
import { Input } from "@/components/admin/input";
import { Switch } from "@/components/admin/switch";
import { type OptionGroup } from "@/lib/admin/catalog";
import { uid } from "@/lib/admin/editor-helpers";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Picker } from "./EditorFields";

export default function GroupForm({
  initial,
  busy,
  onCancel,
  onSave,
  onRefresh,
}: {
  initial: OptionGroup;
  busy: boolean;
  onRefresh: () => Promise<void>;
  onCancel: () => void;
  onSave: (g: OptionGroup, connectAll: boolean) => Promise<void>;
}) {
  const [g, setG] = useState(initial),
    [error, setError] = useState(""),
    [connectAll, setConnectAll] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          await onSave(g, connectAll);
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <fieldset disabled={busy}>
        <label className="field">
          그룹 이름
          <Input
            value={g.name}
            required
            maxLength={80}
            onChange={(e) => setG({ ...g, name: e.target.value })}
            placeholder="예: 드레싱 선택"
          />
        </label>
        <label className="field">
          선택 항목 구성
          <Picker
            value={g.source}
            label="선택 항목 구성"
            onChange={(v) => setG({ ...g, source: v as OptionGroup["source"] })}
            options={[
              ["custom", "직접 항목 등록"],
              ["drinks", "음료 자동 연결"],
              ["dressings", "드레싱 자동 연결"],
            ]}
          />
        </label>
        <div className="toggle-row">
          <label htmlFor="required">필수 선택</label>
          <Switch
            id="required"
            checked={g.required}
            onCheckedChange={(v) => setG({ ...g, required: v })}
          />
        </div>
        <div className="toggle-row">
          <label htmlFor="multiple">여러 개 선택 허용</label>
          <Switch
            id="multiple"
            checked={g.multiple}
            onCheckedChange={(v) => setG({ ...g, multiple: v })}
          />
        </div>
        {g.source === "custom" ? (
          <>
            <div className="field">선택 항목과 추가 금액(원)</div>
            {g.choices.map((c, i) => (
              <div className="choice-editor" key={c.id}>
                <Input
                  required
                  aria-label={"선택 항목 " + (i + 1)}
                  maxLength={80}
                  value={c.name}
                  placeholder="선택 항목"
                  onChange={(e) =>
                    setG({
                      ...g,
                      choices: g.choices.map((x) =>
                        x.id === c.id ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
                <Input
                  type="number"
                  required
                  min={0}
                  max={1000000}
                  aria-label={"추가 금액 " + (i + 1)}
                  value={c.price}
                  onChange={(e) =>
                    setG({
                      ...g,
                      choices: g.choices.map((x) =>
                        x.id === c.id
                          ? { ...x, price: e.target.valueAsNumber || 0 }
                          : x,
                      ),
                    })
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  aria-label={"선택 항목 " + (i + 1) + " 삭제"}
                  disabled={g.choices.length === 1}
                  onClick={() =>
                    setG({
                      ...g,
                      choices: g.choices.filter((x) => x.id !== c.id),
                    })
                  }
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setG({
                  ...g,
                  choices: [...g.choices, { id: uid(), name: "", price: 0 }],
                })
              }
            >
              <Plus size={16} />
              항목 추가
            </Button>
          </>
        ) : (
          <p className="helper">
            메뉴 관리의 해당 탭에서 항목과 가격, 품절·숨김 상태를 관리합니다.
          </p>
        )}
        <div className="toggle-row">
          <div>
            <strong>메뉴 연결</strong>
            <p className="meta">
              옵션 저장 시 삭제되지 않은 모든 샐러드 메뉴에 연결합니다.
            </p>
          </div>
          <Button
            type="button"
            variant={connectAll ? "default" : "outline"}
            aria-pressed={connectAll}
            onClick={() => setConnectAll(!connectAll)}
          >
            {connectAll ? "전체 연결 선택됨" : "모든 메뉴에 연결"}
          </Button>
        </div>
      </fieldset>
      {error && (
        <div role="alert" className="error">
          {error}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-3"
            disabled={busy}
            onClick={onRefresh}
          >
            최신 내용 불러오기
          </Button>
        </div>
      )}
      <div className="form-footer">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onCancel}
        >
          취소
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "저장 중…" : "옵션 저장"}
        </Button>
      </div>
    </form>
  );
}
