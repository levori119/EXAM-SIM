import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronLeft, ChevronRight, Grid3x3, Lightbulb, Star, X } from 'lucide-react';
import { db, type MediaFile, type Question } from '../../db/db';
import { useAuth } from '../../auth/AuthContext';
import { toggleFavorite, type Answers, type PracticeItem, type PracticeRound } from '../../services/practice';
import { ConfirmDialog } from '../../components/Modal';
import { Button } from '../../components/fields';
import { ZoomableImage } from '../../components/media';

const LETTERS = 'אבגדהוזח';

export function useFavoriteIds(): Set<string> {
  const { user } = useAuth();
  const keys = useLiveQuery(() => db.favorites.where('userId').equals(user?.id ?? '').primaryKeys(), [user?.id]);
  return useMemo(() => new Set((keys ?? []).map(([, questionId]) => questionId)), [keys]);
}

export function FavoriteButton({ questionId, favorite, size = 'md' }: { questionId: string; favorite: boolean; size?: 'sm' | 'md' }) {
  const { user } = useAuth();
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.8 }}
      onClick={() => user && toggleFavorite(user.id, questionId)}
      aria-pressed={favorite}
      aria-label={favorite ? 'הסרת סימון' : 'סימון לחזרה'}
      title={favorite ? 'מסומנת לחזרה' : 'סימון לחזרה'}
      className={`flex shrink-0 items-center justify-center rounded-xl transition ${size === 'sm' ? 'h-10 w-10' : 'h-12 w-12'} ${
        favorite ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400 dark:text-slate-600'
      }`}
    >
      <Star className={`${size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'} ${favorite ? 'fill-current' : ''}`} />
    </motion.button>
  );
}

interface Props {
  round: PracticeRound;
  questions: Map<string, Question>;
  onFinish: (answers: Answers) => void;
  onExit: () => void;
}

export function PracticeRunner({ round, questions, onFinish, onExit }: Props) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [answers, setAnswers] = useState<Answers>({});
  const [showPalette, setShowPalette] = useState(false);
  const [confirm, setConfirm] = useState<'exit' | 'finish' | null>(null);
  const favorites = useFavoriteIds();

  const immediate = round.settings.reveal === 'immediate';
  const total = round.items.length;
  const item = round.items[index];
  const question = questions.get(item.questionId)!;
  const chosen = answers[item.questionId];
  const locked = immediate && chosen !== undefined;
  const answeredCount = Object.keys(answers).length;

  const go = useCallback(
    (to: number) => {
      if (to < 0 || to >= total) return;
      setDirection(to > index ? 1 : -1);
      setIndex(to);
      setShowPalette(false);
    },
    [index, total],
  );

  const choose = useCallback(
    (originalIndex: number) => {
      if (locked) return;
      setAnswers((a) => ({ ...a, [item.questionId]: originalIndex }));
    },
    [locked, item.questionId],
  );

  const requestFinish = useCallback(() => {
    if (answeredCount < total) setConfirm('finish');
    else onFinish(answers);
  }, [answeredCount, total, answers, onFinish]);

  // Keyboard: 1-8 / א-ח choose, arrows navigate (RTL: left = next), Enter = next/finish.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirm || e.target instanceof HTMLInputElement) return;
      const digit = Number(e.key);
      const letter = LETTERS.indexOf(e.key);
      const pos = digit >= 1 ? digit - 1 : letter;
      if (pos >= 0 && pos < item.optionOrder.length) choose(item.optionOrder[pos]);
      else if (e.key === 'ArrowLeft') go(index + 1);
      else if (e.key === 'ArrowRight') go(index - 1);
      else if (e.key === 'Enter' && chosen !== undefined) {
        if (index < total - 1) go(index + 1);
        else requestFinish();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm, item, choose, go, index, total, chosen, requestFinish]);

  const onSwipe = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) < 80 || Math.abs(info.offset.y) > Math.abs(info.offset.x)) return;
    // RTL: swiping right brings in the next question from the left.
    go(info.offset.x > 0 ? index + 1 : index - 1);
  };

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => setConfirm('exit')}
          aria-label="יציאה מהתרגול"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h1 className="truncate font-semibold" dir="auto">{round.title}</h1>
            <span className="shrink-0 text-sm tabular-nums text-slate-500">
              {index + 1} / {total}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <motion.div
              className="h-full rounded-full bg-indigo-500"
              initial={{ width: 0 }}
              animate={{ width: `${(answeredCount / total) * 100}%` }}
              transition={{ type: 'spring', damping: 25 }}
            />
          </div>
        </div>
        <button
          onClick={() => setShowPalette((p) => !p)}
          aria-label="מפת שאלות"
          aria-expanded={showPalette}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
            showPalette ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Grid3x3 className="h-6 w-6" />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {showPalette && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <QuestionPalette
              items={round.items}
              current={index}
              answers={answers}
              questions={questions}
              favorites={favorites}
              immediate={immediate}
              onGo={go}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Question */}
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div
          key={item.questionId}
          custom={direction}
          initial={{ opacity: 0, x: direction * -40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * 40 }}
          transition={{ duration: 0.18 }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          dragDirectionLock
          onDragEnd={onSwipe}
          className="touch-pan-y"
        >
          <QuestionCard
            question={question}
            item={item}
            chosen={chosen}
            reveal={locked}
            favorite={favorites.has(question.id)}
            onChoose={choose}
          />
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="sticky bottom-20 mt-4 flex items-center justify-between gap-2 md:bottom-4">
        <Button onClick={() => go(index - 1)} disabled={index === 0}>
          <ChevronRight className="h-5 w-5" /> הקודמת
        </Button>
        {!immediate && (
          <Button variant="ghost" onClick={requestFinish} className="hidden sm:inline-flex">
            הגשה ({answeredCount}/{total})
          </Button>
        )}
        {index < total - 1 ? (
          <Button variant={locked ? 'primary' : 'secondary'} onClick={() => go(index + 1)}>
            הבאה <ChevronLeft className="h-5 w-5" />
          </Button>
        ) : (
          <Button variant="primary" onClick={requestFinish}>
            סיום והצגת תוצאות
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirm === 'exit'}
        title="יציאה מהתרגול"
        message="התשובות בתרגול הזה לא יישמרו. לצאת?"
        confirmLabel="יציאה"
        onConfirm={onExit}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'finish'}
        title="סיום התרגול"
        message={`ענית על ${answeredCount} מתוך ${total} שאלות. שאלות שלא נענו ייחשבו כשגויות. לסיים?`}
        confirmLabel="סיום"
        onConfirm={() => onFinish(answers)}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}

function QuestionCard({
  question,
  item,
  chosen,
  reveal,
  favorite,
  onChoose,
}: {
  question: Question;
  item: PracticeItem;
  chosen: number | undefined;
  reveal: boolean;
  favorite: boolean;
  onChoose: (originalIndex: number) => void;
}) {
  const images = useLiveQuery(
    async () => (await db.media.bulkGet(question.imageIds ?? [])).filter((m): m is MediaFile => !!m),
    [question.id],
  );
  const hasImages = !!images?.length;
  const correct = chosen === question.correctIndex;

  return (
    <div className={`grid gap-4 ${hasImages ? 'md:grid-cols-2' : ''}`}>
      <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-start gap-2">
          <p className="flex-1 whitespace-pre-line text-lg font-medium leading-relaxed" dir="auto">
            {question.text}
          </p>
          <FavoriteButton questionId={question.id} favorite={favorite} />
        </div>

        <ul className="space-y-2.5">
          {item.optionOrder.map((original, pos) => {
            const isChosen = chosen === original;
            const isCorrect = original === question.correctIndex;
            let style = 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-slate-700 dark:hover:bg-indigo-500/5';
            let badge = 'border-slate-300 text-slate-500 dark:border-slate-600';
            if (reveal && isCorrect) {
              style = 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10';
              badge = 'border-emerald-500 bg-emerald-500 text-white';
            } else if (reveal && isChosen) {
              style = 'border-red-500 bg-red-50 dark:bg-red-500/10';
              badge = 'border-red-500 bg-red-500 text-white';
            } else if (isChosen) {
              style = 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10';
              badge = 'border-indigo-500 bg-indigo-500 text-white';
            } else if (reveal) {
              style = 'border-slate-200 opacity-60 dark:border-slate-700';
            }
            return (
              <li key={original}>
                <motion.button
                  type="button"
                  disabled={reveal}
                  onClick={() => onChoose(original)}
                  whileTap={reveal ? undefined : { scale: 0.98 }}
                  animate={reveal && isChosen && !isCorrect ? { x: [0, -6, 6, -3, 3, 0] } : undefined}
                  className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-start transition disabled:cursor-default ${style}`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${badge}`}>
                    {reveal && isCorrect ? <Check className="h-5 w-5" /> : reveal && isChosen ? <X className="h-5 w-5" /> : LETTERS[pos]}
                  </span>
                  <span className="flex-1" dir="auto">{question.options[original]}</span>
                </motion.button>
              </li>
            );
          })}
        </ul>

        <AnimatePresence>
          {reveal && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mt-4 rounded-2xl px-4 py-3 ${
                correct
                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300'
                  : 'bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-300'
              }`}
            >
              <div className="font-semibold">{correct ? 'נכון! 🎉' : 'לא נכון'}</div>
              {question.explanation && (
                <p className="mt-1 flex gap-2 text-sm text-slate-700 dark:text-slate-300" dir="auto">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  {question.explanation}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {hasImages && (
        <div className="space-y-3 md:sticky md:top-4 md:self-start">
          {images.map((m) => (
            <ZoomableImage key={m.id} item={m} className="w-full" />
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionPalette({
  items,
  current,
  answers,
  questions,
  favorites,
  immediate,
  onGo,
}: {
  items: PracticeItem[];
  current: number;
  answers: Answers;
  questions: Map<string, Question>;
  favorites: Set<string>;
  immediate: boolean;
  onGo: (i: number) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      {items.map(({ questionId }, i) => {
        const answer = answers[questionId];
        let tone = 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
        if (answer !== undefined) {
          tone = !immediate
            ? 'bg-indigo-500 text-white'
            : answer === questions.get(questionId)?.correctIndex
              ? 'bg-emerald-500 text-white'
              : 'bg-red-500 text-white';
        }
        return (
          <button
            key={questionId}
            onClick={() => onGo(i)}
            className={`relative h-12 w-12 rounded-xl text-sm font-semibold tabular-nums ${tone} ${
              i === current ? 'ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-slate-900' : ''
            }`}
          >
            {i + 1}
            {favorites.has(questionId) && <Star className="absolute -end-1 -top-1 h-4 w-4 fill-amber-400 text-amber-400" />}
          </button>
        );
      })}
    </div>
  );
}
