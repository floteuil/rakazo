import {
  CRON_FREQS,
  type CronFreq,
  type CronPreset,
  type CronUnit,
  cronFromPreset,
  describeCronPresetFr,
  formatClock24Fr,
} from "@rakazo/core";

const UNITS: CronUnit[] = ["minutes", "hours", "days"];
const NUMBERS = [1, 2, 3, 5, 10, 15, 30, 45];
const TIMES = [
  "6:00 AM",
  "7:00 AM",
  "7:30 AM",
  "8:00 AM",
  "8:30 AM",
  "9:00 AM",
  "9:30 AM",
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "12:30 PM",
  "2:00 PM",
  "3:00 PM",
  "4:00 PM",
  "5:00 PM",
  "6:00 PM",
  "7:00 PM",
  "8:00 PM",
  "9:00 PM",
  "10:00 PM",
];

const FREQ_LABELS_FR: Record<CronFreq, string> = {
  "Every hour": "Toutes les heures",
  "Every day": "Tous les jours",
  Weekdays: "Jours ouvrés (Lun–Ven)",
  "Every week": "Chaque semaine (Lundi)",
  "Every month": "Chaque mois (le 1er)",
  Interval: "Intervalle régulier",
  Advanced: "Avancé (Cron)",
};

const UNIT_LABELS_FR: Record<CronUnit, string> = {
  minutes: "minutes",
  hours: "heures",
  days: "jours",
};

const TIMED: CronFreq[] = ["Every day", "Weekdays", "Every week", "Every month"];

export function RoutineSchedule({
  value,
  onChange,
}: {
  value: CronPreset;
  onChange: (next: CronPreset) => void;
}) {
  const { lead, detail } = describeCronPresetFr(value);
  const current24 = formatClock24Fr(value.time);
  const hasMatchingTime = TIMES.some((t) => formatClock24Fr(t) === current24 && t === value.time);
  const times = hasMatchingTime ? TIMES : [...TIMES, value.time];
  const numbers = NUMBERS.includes(value.n) ? NUMBERS : [...NUMBERS, value.n].sort((a, b) => a - b);

  function patch(partial: Partial<CronPreset>) {
    onChange({ ...value, ...partial });
  }

  return (
    <div
      data-testid="routine-schedule-editor"
      className="mt-2 rounded-[13px] border border-[#26262A] p-3"
    >
      <div className="flex flex-wrap items-center gap-2 px-0.5">
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#C9C9CE"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        <span className="text-[14.5px] text-[#ECECEE]">{lead}</span>
        {detail ? <span className="flex-1 text-[14.5px] text-[#85858A]">{detail}</span> : null}
        <span
          data-testid="routine-timezone-badge"
          title="Fuseau horaire Europe/Paris avec passage automatique heure d'hiver / heure d'été"
          className="ml-auto shrink-0 rounded-full border border-[#34343A] bg-[#1A1A20] px-2 py-0.5 text-[11px] font-medium text-[#A8A8B2]"
        >
          Heure de Paris (24h)
        </span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-[11px] bg-[#16161A] px-2.5 py-2.5 text-[14px] text-[#7A7A80]">
        <select
          className="rk-schedule-select text-[16px] sm:text-[14px]"
          value={value.freq}
          aria-label="Fréquence"
          onChange={(event) => {
            const freq = event.target.value as CronFreq;
            if (freq === "Advanced") {
              patch({ freq, cron: cronFromPreset(value) });
              return;
            }
            patch({ freq });
          }}
        >
          {CRON_FREQS.map((freq) => (
            <option key={freq} value={freq}>
              {FREQ_LABELS_FR[freq]}
            </option>
          ))}
        </select>
        {value.freq === "Interval" ? (
          <>
            <span>{value.unit === "days" ? "tous les" : "toutes les"}</span>
            <select
              className="rk-schedule-select text-[16px] sm:text-[14px]"
              value={String(value.n)}
              aria-label="Valeur de l'intervalle"
              onChange={(event) => patch({ n: Number(event.target.value) })}
            >
              {numbers.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <select
              className="rk-schedule-select text-[16px] sm:text-[14px]"
              value={value.unit}
              aria-label="Unité de l'intervalle"
              onChange={(event) => patch({ unit: event.target.value as CronUnit })}
            >
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {UNIT_LABELS_FR[unit]}
                </option>
              ))}
            </select>
          </>
        ) : null}
        {TIMED.includes(value.freq) ? (
          <>
            <span>à</span>
            <select
              className="rk-schedule-select text-[16px] sm:text-[14px]"
              value={value.time}
              aria-label="Heure de la journée"
              onChange={(event) => patch({ time: event.target.value })}
            >
              {times.map((time) => (
                <option key={time} value={time}>
                  {formatClock24Fr(time)}
                </option>
              ))}
            </select>
          </>
        ) : null}
        {value.freq === "Advanced" ? (
          <input
            value={value.cron}
            placeholder="0 9 * * 1-5"
            aria-label="Expression Cron"
            onChange={(event) => patch({ cron: event.target.value })}
            className="min-w-[120px] flex-1 rounded-lg border-0 bg-[#24242A] px-2.5 py-1.5 font-mono text-[16px] text-[#ECECEE] outline-none sm:text-[13.5px]"
          />
        ) : null}
      </div>
    </div>
  );
}
