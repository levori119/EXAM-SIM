export interface ParsedQuestion {
  number: number;
  text: string;
  options: string[];
  correctIndex: number | null;
}

const HEBREW_LETTERS = 'אבגדהו';
const LATIN_LETTERS = 'abcdef';

const QUESTION_RE = /^\s*(?:שאלה\s*(?:מס['׳]?\s*)?|Q(?:uestion)?\s*)?(\d{1,3})\s*[.):\-]\s*(.*)$/i;
const OPTION_RE = /^\s*\(?([א-ו]|[a-fA-F])\s*[.)'׳]\s*(.*)$/;
const ANSWER_KEY_HEADER_RE = /^\s*(מפתח(?:\s+תשובות)?|תשובות(?:\s+נכונות)?|answer\s*key|answers)\s*:?\s*$/i;
// Separator optional so table-style keys ("1  ב") work too.
const ANSWER_PAIR_RE = /(\d{1,3})\s*[.):\-]?\s*\(?([א-ו]|[a-fA-F])(?![א-ת\w])/g;
const CORRECT_MARK_RE = /^\s*[*✓✔]\s*|\s*[*✓✔]\s*$|\s*\((?:נכון|correct)\)\s*$/i;

function letterToIndex(letter: string): number {
  const he = HEBREW_LETTERS.indexOf(letter);
  return he >= 0 ? he : LATIN_LETTERS.indexOf(letter.toLowerCase());
}

/**
 * Heuristic parser for numbered multiple-choice questions.
 *
 * Recognises:
 *  - "1. question" / "שאלה 1:" / "Q1)" question headers
 *  - "א." / "(ב)" / "a)" option lines
 *  - a correct option marked with "*", "✓" or "(נכון)"
 *  - a trailing answer key ("מפתח תשובות" / "Answer key") with "1-ב 2-ג" pairs
 */
export function parseQuestions(text: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  const answerKey = new Map<number, number>();
  let current: ParsedQuestion | null = null;
  let inAnswerKey = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (ANSWER_KEY_HEADER_RE.test(line)) {
      inAnswerKey = true;
      continue;
    }
    if (inAnswerKey) {
      for (const [num, index] of parseAnswerKey(line)) answerKey.set(num, index);
      continue;
    }

    const option = current && OPTION_RE.exec(line);
    if (current && option) {
      let optionText = option[2];
      if (CORRECT_MARK_RE.test(optionText)) {
        current.correctIndex = current.options.length;
        optionText = optionText.replace(CORRECT_MARK_RE, '');
      }
      current.options.push(optionText.trim());
      continue;
    }

    const header = QUESTION_RE.exec(line);
    if (header) {
      current = { number: Number(header[1]), text: header[2].trim(), options: [], correctIndex: null };
      questions.push(current);
      continue;
    }

    // Continuation of the previous option or the question body.
    if (current) {
      if (current.options.length) current.options[current.options.length - 1] += ' ' + line;
      else current.text = current.text ? `${current.text} ${line}` : line;
    }
  }

  for (const q of questions) {
    const keyed = answerKey.get(q.number);
    if (keyed !== undefined && keyed < q.options.length) q.correctIndex = keyed;
  }

  // Drop numbered lines that were not really questions (no options).
  return questions.filter((q) => q.text && q.options.length >= 2);
}

/** Reads "question number → option index" pairs from an answer-key text (a separate file or section). */
export function parseAnswerKey(text: string): Map<number, number> {
  const key = new Map<number, number>();
  for (const [, num, letter] of text.matchAll(ANSWER_PAIR_RE)) {
    key.set(Number(num), letterToIndex(letter));
  }
  return key;
}
