import { AGE_PROFILES, ageRangeLabel } from "../core/ages";
import { useServices } from "./services";

/** `<option>`s for every theme, youngest audience first, each with its age range. */
export function ThemeOptions() {
  const { themes } = useServices();
  return (
    <>
      {themes
        .list()
        .map((t) => ({ t, youngest: AGE_PROFILES.findIndex((a) => t.ages.includes(a.id)) }))
        .sort((a, b) => a.youngest - b.youngest)
        .map(({ t }) => (
          <option key={t.id} value={t.id}>
            {t.label} ({ageRangeLabel(t.ages)})
          </option>
        ))}
    </>
  );
}
