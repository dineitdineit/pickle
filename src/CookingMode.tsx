import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import BackIcon from "./BackIcon"
import RecipeImage from "./RecipeImage"
import { recipeImageUrl } from "./lib/recipe"
import { formatIngredientQuantity } from "./lib/ingredientUnits"
import type { IngredientRow, StepRow } from "./recipeTypes"
import {
  cookingKey,
  cookingSignature,
  COOKING_TTL,
  freshCookingProgress,
  restoreCookingProgress,
  scaledIngredientAmount,
  startCookingTimer,
  pauseCookingTimer,
  timerRemaining,
  timerLabel,
  toggleCookingId,
  validServings,
  type CookingProgress,
} from "./lib/cooking"
import useCookingWakeLock from "./useCookingWakeLock"
import "./cooking-mode.css"

interface Props {
  recipeId: string
  title: string
  ingredients: IngredientRow[]
  steps: StepRow[]
  servings: number | null
  userId: string | null
  onClose: () => void
}

export default function CookingMode({
  recipeId,
  title,
  ingredients,
  steps,
  servings,
  userId,
  onClose,
}: Props) {
  const key = cookingKey(recipeId, userId)
  const signature = cookingSignature(ingredients, steps, servings)
  const [progress, setProgress] = useState<CookingProgress>(() => {
    try {
      return restoreCookingProgress(
        JSON.parse(localStorage.getItem(key) ?? "null"),
        signature,
        ingredients,
        steps,
        servings,
      )
    } catch {
      return freshCookingProgress(signature, steps, servings)
    }
  })
  const [awake, setAwake] = useState(false)
  const awakeStatus = useCookingWakeLock(awake)
  const [now, setNow] = useState(Date.now())
  const [servingDraft, setServingDraft] = useState(
    String(progress.servings ?? ""),
  )
  const [error, setError] = useState("")
  const [storageError, setStorageError] = useState(false)
  const [resetting, setResetting] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const snapshot = useRef(progress)
  const audio = useRef<AudioContext | null>(null)
  const alerted = useRef(new Set<string>())
  snapshot.current = progress
  const index = Math.max(
    0,
    steps.findIndex((step) => step.id === progress.activeStep),
  )
  const step = steps[index]
  const complete = steps.length > 0 && progress.steps.length === steps.length

  useEffect(() => {
    const modal = dialog.current
    const focused = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    modal?.showModal()
    return () => {
      modal?.close()
      document.body.style.overflow = overflow
      focused?.focus?.({ preventScroll: true })
      void audio.current?.close().catch(() => {})
      audio.current = null
    }
  }, [])
  useEffect(() => {
    // Expired progress is removed when cooking mode is opened; no server copy.
    try {
      const keys = Array.from({ length: localStorage.length }, (_, i) =>
        localStorage.key(i),
      )
      for (const storedKey of keys)
        if (storedKey?.startsWith("pickle:cooking:")) {
          try {
            const cached = JSON.parse(localStorage.getItem(storedKey) ?? "null")
            if (
              !cached ||
              !Number.isFinite(cached.updatedAt) ||
              Date.now() - cached.updatedAt > COOKING_TTL
            )
              localStorage.removeItem(storedKey)
          } catch {
            localStorage.removeItem(storedKey)
          }
        }
    } catch {
      /* Cooking remains usable without device storage. */
    }
    function flush() {
      try {
        localStorage.setItem(key, JSON.stringify(snapshot.current))
        setStorageError(false)
      } catch {
        setStorageError(true)
      }
    }
    window.addEventListener("pagehide", flush)
    return () => {
      window.removeEventListener("pagehide", flush)
      try {
        localStorage.setItem(key, JSON.stringify(snapshot.current))
      } catch {
        /* Already disclosed by the save effect. */
      }
    }
  }, [key])
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(progress))
      setStorageError(false)
    } catch {
      setStorageError(true)
    }
  }, [key, progress])
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const interval = window.setInterval(tick, 1000)
    document.addEventListener("visibilitychange", tick)
    window.addEventListener("focus", tick)
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", tick)
      window.removeEventListener("focus", tick)
    }
  }, [])
  useEffect(() => {
    for (const [id, timer] of Object.entries(progress.timers)) {
      const token = `${id}:${timer.endsAt}`
      if (
        timer.endsAt === null ||
        timerRemaining(timer, now) > 0 ||
        alerted.current.has(token)
      )
        continue
      alerted.current.add(token)
      if (
        document.visibilityState !== "visible" ||
        !audio.current ||
        audio.current.state !== "running"
      )
        continue
      try {
        const oscillator = audio.current.createOscillator(),
          gain = audio.current.createGain()
        oscillator.frequency.value = 880
        gain.gain.setValueAtTime(0.15, audio.current.currentTime)
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          audio.current.currentTime + 0.6,
        )
        oscillator.connect(gain)
        gain.connect(audio.current.destination)
        oscillator.start()
        oscillator.stop(audio.current.currentTime + 0.6)
        oscillator.onended = () => {
          oscillator.disconnect()
          gain.disconnect()
        }
      } catch {
        /* The visible timer-complete message is always available. */
      }
    }
  }, [now, progress.timers])

  function update(change: Partial<CookingProgress>) {
    setProgress((current) => ({ ...current, ...change, updatedAt: Date.now() }))
  }
  function timerChange(
    id: string,
    timer: CookingProgress["timers"][string] | null,
  ) {
    setProgress((current) => {
      const timers = { ...current.timers }
      if (timer) timers[id] = timer
      else delete timers[id]
      return { ...current, timers, updatedAt: Date.now() }
    })
  }
  function unlockSound() {
    try {
      audio.current ??= new AudioContext()
      void audio.current.resume().catch(() => {})
    } catch {
      /* Visual completion is still available. */
    }
  }
  function reset() {
    setProgress(freshCookingProgress(signature, steps, servings))
    setServingDraft(String(validServings(servings) ? servings : ""))
    setAwake(false)
    setResetting(false)
    setError("")
    alerted.current.clear()
  }
  function markStep() {
    if (!step) return
    const already = progress.steps.includes(step.id)
    update({
      steps: toggleCookingId(progress.steps, step.id),
      activeStep:
        !already && index < steps.length - 1 ? steps[index + 1].id : step.id,
    })
    scrollToStep()
  }
  function scrollToStep() {
    requestAnimationFrame(() =>
      document
        .getElementById("cooking-step-card")
        ?.scrollIntoView({ block: "start", behavior: "smooth" }),
    )
  }
  function goToStep(id: string) {
    update({ activeStep: id })
    scrollToStep()
  }
  const timers = Object.entries(progress.timers)
  return createPortal(
    <dialog
      ref={dialog}
      className="cooking-mode"
      aria-labelledby="cooking-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div className="cooking-shell">
        <header className="cooking-header">
          <button type="button" aria-label="Back to recipe" onClick={onClose}>
            <BackIcon />
          </button>
          <div>
            <small>COOKING MODE</small>
            <h1 id="cooking-title">{title}</h1>
          </div>
          <button
            type="button"
            className="cooking-reset"
            onClick={() => setResetting(true)}
          >
            Reset
          </button>
        </header>
        <div className="cooking-content">
          <div className="cooking-progress">
            <span>
              {progress.steps.length} of {steps.length} steps done
            </span>
            <progress
              aria-label="Cooking progress"
              max={Math.max(1, steps.length)}
              value={progress.steps.length}
            />
          </div>
          <label className="cooking-awake">
            <span>Keep screen awake</span>
            <input
              type="checkbox"
              checked={awake}
              onChange={(event) => setAwake(event.target.checked)}
            />
          </label>
          {awakeStatus && (
            <p className="cooking-note" role="status">
              {awakeStatus}
            </p>
          )}
          <p className="cooking-note">
            Progress stays on this device. Resume within 30 days of your last
            change.
          </p>
          {storageError && (
            <p className="cooking-warning" role="status">
              Progress cannot be saved on this device. Keep cooking mode open to
              retain it.
            </p>
          )}
          {resetting && (
            <div
              className="cooking-reset-confirm"
              role="group"
              aria-label="Reset cooking session"
            >
              <p>Reset progress and stop all timers?</p>
              <div>
                <button type="button" onClick={() => setResetting(false)}>
                  Keep cooking
                </button>
                <button type="button" onClick={reset}>
                  Reset session
                </button>
              </div>
            </div>
          )}
          <section aria-labelledby="cooking-ingredients-title">
            <div className="cooking-section-title">
              <h2 id="cooking-ingredients-title">Ingredients</h2>
              <span>
                {progress.ingredients.length}/{ingredients.length} ready
              </span>
            </div>
            <div className="cooking-quantity-controls">
              {validServings(servings) ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    const value = Number(servingDraft)
                    if (!validServings(value)) {
                      setError("Choose between 0.5 and 1,000 servings.")
                      return
                    }
                    update({ servings: value })
                    setError("")
                  }}
                >
                  <label>
                    Servings
                    <input
                      type="number"
                      min="0.5"
                      max="1000"
                      step="0.5"
                      value={servingDraft}
                      onChange={(event) => setServingDraft(event.target.value)}
                    />
                  </label>
                  <button type="submit">Apply</button>
                </form>
              ) : (
                <p className="cooking-note">
                  Original servings are unspecified; quantities stay unchanged.
                </p>
              )}
              <div
                className="cooking-unit-switch"
                role="group"
                aria-label="Cooking ingredient units"
              >
                {(["US", "Metric"] as const).map((units) => (
                  <button
                    type="button"
                    key={units}
                    aria-pressed={progress.units === units}
                    onClick={() => update({ units })}
                  >
                    {units}
                  </button>
                ))}
              </div>
            </div>
            {validServings(servings) && (
              <p className="cooking-note">
                {progress.servings === servings
                  ? `Original recipe: ${servings} servings.`
                  : `Adjusted to ${progress.servings} servings from ${servings}.`}{" "}
                Instructions and cooking times stay as written. Season to taste.
              </p>
            )}
            <ul className="cooking-ingredients">
              {ingredients.map((item, i) => (
                <li key={item.id}>
                  {item.group_name &&
                    item.group_name !== "Main" &&
                    item.group_name !== ingredients[i - 1]?.group_name && (
                      <h3 className="cooking-group-name">{item.group_name}</h3>
                    )}
                  <label
                    className={
                      progress.ingredients.includes(item.id) ? "is-checked" : ""
                    }
                  >
                    <input
                      type="checkbox"
                      checked={progress.ingredients.includes(item.id)}
                      onChange={() =>
                        update({
                          ingredients: toggleCookingId(
                            progress.ingredients,
                            item.id,
                          ),
                        })
                      }
                    />
                    <span>
                      <strong>{item.ingredients?.name || "Ingredient"}</strong>
                      {item.optional && <small>Optional</small>}
                      {item.substitute && (
                        <small>Side note / substitute: {item.substitute}</small>
                      )}
                    </span>
                    <span className="cooking-amount">
                      {formatIngredientQuantity(
                        scaledIngredientAmount(
                          item.amount,
                          item.unit,
                          servings,
                          progress.servings,
                        ),
                        item.unit,
                        progress.units,
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
          {timers.length > 0 && (
            <section className="cooking-timers" aria-label="Cooking timers">
              <h2>Timers</h2>
              {timers.map(([id, timer]) => {
                const owner = steps.find((value) => value.id === id),
                  remaining = timerRemaining(timer, now)
                if (!owner) return null
                return (
                  <div
                    key={id}
                    className={remaining === 0 ? "cooking-timer-finished" : ""}
                  >
                    <button type="button" onClick={() => goToStep(id)}>
                      {owner.title || `Step ${owner.step_number}`}
                    </button>
                    <span
                      role={remaining === 0 ? "status" : "timer"}
                      aria-live={remaining === 0 ? "polite" : "off"}
                    >
                      {remaining === 0
                        ? "Timer finished"
                        : timerLabel(remaining)}
                      {remaining > 0 && timer.endsAt === null
                        ? " · Paused"
                        : ""}
                    </span>
                    <button
                      type="button"
                      aria-label={`Clear timer for ${owner.title || `step ${owner.step_number}`}`}
                      onClick={() => timerChange(id, null)}
                    >
                      Clear
                    </button>
                  </div>
                )
              })}
            </section>
          )}
          <section className="cooking-steps" aria-label="Cooking steps">
            <div className="cooking-section-title">
              <h2>Steps</h2>
              <span>
                {steps.length
                  ? `${index + 1}/${steps.length}`
                  : "No steps provided"}
              </span>
            </div>
            <div
              className="cooking-step-picker"
              role="group"
              aria-label="Choose cooking step"
            >
              {steps.map((value, i) => (
                <button
                  key={value.id}
                  type="button"
                  aria-label={`Step ${i + 1}${
                    progress.steps.includes(value.id) ? ", completed" : ""
                  }`}
                  aria-pressed={value.id === step?.id}
                  onClick={() => goToStep(value.id)}
                >
                  {progress.steps.includes(value.id) ? "✓" : i + 1}
                </button>
              ))}
            </div>
            {step && (
              <article
                id="cooking-step-card"
                className="cooking-step-card"
                key={step.id}
              >
                {step.step_image && (
                  <RecipeImage
                    src={recipeImageUrl(step.step_image)}
                    alt={step.title || `Step ${index + 1}`}
                  />
                )}
                <h3>{step.title || `Step ${index + 1}`}</h3>
                <p className="cooking-instruction">{step.instruction}</p>
                <StepTimer
                  key={step.id}
                  step={step}
                  timer={progress.timers[step.id]}
                  now={now}
                  onTimer={(timer) => timerChange(step.id, timer)}
                  unlockSound={unlockSound}
                  onError={setError}
                />
              </article>
            )}
            <p className="cooking-note">
              Timers count elapsed time when you switch apps, but sound and
              completion alerts require cooking mode to be open and visible. Use
              your phone’s Clock for a background alarm.
            </p>
          </section>
          {complete && (
            <div className="cooking-complete" role="status">
              <strong>All steps complete!</strong>
              <p>Your cooking progress is saved.</p>
              <button type="button" onClick={onClose}>
                Back to recipe
              </button>
            </div>
          )}
          {error && (
            <p className="cooking-warning" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="cooking-footer">
          <button
            type="button"
            disabled={index === 0 || !step}
            onClick={() => goToStep(steps[index - 1].id)}
          >
            Previous
          </button>
          <button
            type="button"
            className="cooking-primary"
            disabled={!step}
            onClick={markStep}
          >
            {step && progress.steps.includes(step.id)
              ? "Mark not done"
              : index < steps.length - 1
                ? "Done & next"
                : "Mark step done"}
          </button>
          <button
            type="button"
            disabled={index >= steps.length - 1 || !step}
            onClick={() => goToStep(steps[index + 1].id)}
          >
            Next
          </button>
        </footer>
      </div>
    </dialog>,
    document.body,
  )
}

function StepTimer({
  step,
  timer,
  now,
  onTimer,
  unlockSound,
  onError,
}: {
  step: StepRow
  timer?: CookingProgress["timers"][string]
  now: number
  onTimer: (timer: CookingProgress["timers"][string] | null) => void
  unlockSound: () => void
  onError: (message: string) => void
}) {
  const [minutes, setMinutes] = useState(
    String(
      step.step_time_minutes && step.step_time_minutes > 0
        ? Math.min(1440, step.step_time_minutes)
        : 5,
    ),
  )
  const remaining = timer ? timerRemaining(timer, now) : null
  return (
    <div className="cooking-step-timer">
      {timer ? (
        <>
          <span className="cooking-timer-clock" role="timer" aria-live="off">
            {timerLabel(remaining!)}
          </span>
          {remaining! > 0 && (
            <button
              type="button"
              onClick={() => {
                unlockSound()
                const actual = Date.now()
                onTimer(
                  timer.endsAt === null
                    ? { ...timer, endsAt: actual + timer.remainingMs }
                    : pauseCookingTimer(timer, actual),
                )
              }}
            >
              {timer.endsAt === null ? "Resume timer" : "Pause timer"}
            </button>
          )}
          <button type="button" onClick={() => onTimer(null)}>
            Reset timer
          </button>
        </>
      ) : (
        <>
          <label>
            Minutes
            <input
              type="number"
              aria-label={`Timer minutes for step ${step.step_number}`}
              min="0.1"
              max="1440"
              step="0.1"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              try {
                const next = startCookingTimer(Number(minutes), Date.now())
                unlockSound()
                onTimer(next)
                onError("")
              } catch (failure) {
                onError((failure as Error).message)
              }
            }}
          >
            Start timer
          </button>
        </>
      )}
    </div>
  )
}
