import type { Locator, Page } from "playwright";
import type { AnswerQuestionsFn } from "./types";

export interface ExtractedQuestion {
  id: string;
  label: string;
  kind: "text" | "textarea" | "number" | "select" | "radio" | "checkbox";
  options?: string[];
  required: boolean;
}

interface FieldHandle {
  question: ExtractedQuestion;
  locator: Locator;
}

/**
 * Generic form extraction: reads every visible, empty input of a form
 * container and turns it into a question the AI can answer. Works for most
 * ATS forms without per-site code.
 */
export async function extractQuestions(container: Locator): Promise<FieldHandle[]> {
  const fields: FieldHandle[] = [];
  const inputs = container.locator(
    "input:not([type=hidden]):not([type=file]):not([type=submit]):not([type=radio]):not([type=checkbox]), textarea, select",
  );

  for (let i = 0; i < (await inputs.count()); i++) {
    const input = inputs.nth(i);
    if (!(await input.isVisible()) || (await input.inputValue().catch(() => "")) !== "") continue;
    const tag = await input.evaluate((el) => el.tagName.toLowerCase());
    const type = (await input.getAttribute("type")) ?? "text";
    const kind: ExtractedQuestion["kind"] =
      tag === "select" ? "select" : tag === "textarea" ? "textarea" : type === "number" ? "number" : "text";
    const options =
      kind === "select"
        ? (await input.locator("option").allInnerTexts()).map((o) => o.trim()).filter((o) => o && !/^select/i.test(o))
        : undefined;
    fields.push({
      locator: input,
      question: {
        id: `f${i}`,
        label: await labelFor(input),
        kind,
        options,
        required: (await input.getAttribute("required")) !== null || (await input.getAttribute("aria-required")) === "true",
      },
    });
  }

  const groups = container.locator("fieldset:has(input[type=radio])");
  for (let i = 0; i < (await groups.count()); i++) {
    const group = groups.nth(i);
    if ((await group.locator("input[type=radio]:checked").count()) > 0) continue;
    fields.push({
      locator: group,
      question: {
        id: `r${i}`,
        label: (await group.locator("legend").first().innerText().catch(() => "")).trim(),
        kind: "radio",
        options: (await group.locator("label").allInnerTexts()).map((o) => o.trim()),
        required: true,
      },
    });
  }
  return fields;
}

async function labelFor(input: Locator): Promise<string> {
  const aria = await input.getAttribute("aria-label");
  if (aria) return aria.trim();
  const id = await input.getAttribute("id");
  if (id) {
    const label = input.page().locator(`label[for="${id}"]`);
    if ((await label.count()) > 0) return (await label.first().innerText()).trim();
  }
  return ((await input.getAttribute("placeholder")) ?? (await input.getAttribute("name")) ?? "").trim();
}

export type FillOutcome = { complete: true } | { complete: false; missing: string[] };

/** Extracts the questions, asks the AI, fills what it can and reports what is missing. */
export async function fillForm(container: Locator, answer: AnswerQuestionsFn): Promise<FillOutcome> {
  const fields = await extractQuestions(container);
  if (fields.length === 0) return { complete: true };

  const answers = new Map((await answer(fields.map((f) => f.question))).map((a) => [a.questionId, a.value]));
  const missing: string[] = [];

  for (const { question, locator } of fields) {
    const value = answers.get(question.id) ?? null;
    if (value === null) {
      if (question.required) missing.push(question.label);
      continue;
    }
    switch (question.kind) {
      case "select":
        await locator.selectOption({ label: value });
        break;
      case "radio":
        await locator.getByLabel(value, { exact: true }).check();
        break;
      default:
        await locator.fill(value);
    }
  }
  return missing.length === 0 ? { complete: true } : { complete: false, missing };
}

export async function humanPause(page: Page, ms: number): Promise<void> {
  await page.waitForTimeout(ms);
}
