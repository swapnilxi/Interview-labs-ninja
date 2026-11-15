import { Bar, difficultyTone, toneClass } from '@/modules/daily-session/components/ds';

interface DifficultyLevel {
  level: string;
  /** Questions at this level in your bank. */
  attempted: number;
  /** Of those, how many you rated 4 or 5 out of 5. */
  correct: number;
  /** correct / attempted, 0-100. */
  accuracy: number;
  /** Ignored: the colour comes from the level's Daily Session tone (Easy jade, Medium saffron, Hard rose). */
  color?: string;
}

interface DifficultyProgressCardProps {
  difficulties: DifficultyLevel[];
}

/** Each level: how many of its questions you rated 4 or 5 out of 5. */
export default function DifficultyProgressCard({ difficulties }: DifficultyProgressCardProps) {
  return (
    <section className="ds-list" aria-labelledby="ins-diff-title">
      <div className="ins-card-head">
        <div className="min-w-0">
          <h3 id="ins-diff-title">By difficulty</h3>
          <p>Questions you rated 4 or 5 out of 5</p>
        </div>
      </div>
      {difficulties.map((d) => {
        const tone = difficultyTone(d.level);
        const none = d.attempted === 0;
        return (
          <div key={d.level} className="ds-list-row ins-barrow">
            <div className="min-w-0 flex-1">
              <div className="ins-barrow-top">
                <p className={`ins-barrow-name ins-key ${toneClass(tone)}`}>
                  <i aria-hidden="true" />
                  <span className="ds-ink">{d.level}</span>
                </p>
                <span className="ins-barrow-pct" data-empty={none || undefined}>
                  {none ? 'No questions' : `${d.accuracy}%`}
                </span>
              </div>
              {!none && (
                <>
                  <p className="ins-barrow-note">
                    {d.correct} of {d.attempted} rated 4+
                  </p>
                  <Bar
                    value={d.accuracy / 100}
                    tone={tone}
                    label={`${d.level}: ${d.correct} of ${d.attempted} rated 4 or 5`}
                  />
                </>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
