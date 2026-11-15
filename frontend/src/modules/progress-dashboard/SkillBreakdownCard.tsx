import Icon from '@/components/ui/AppIcon';
import { Bar } from '@/modules/daily-session/components/ds';

interface SkillData {
  category: string;
  /** Questions in this skill that you have rated. */
  completed: number;
  /** Questions in this skill in your bank. */
  total: number;
  /** completed / total, 0-100. */
  accuracy: number;
  icon: string;
}

interface SkillBreakdownCardProps {
  skills: SkillData[];
}

/** Skills as a grouped list: one row per skill, how much of it you have rated, and a thin bar. */
export default function SkillBreakdownCard({ skills }: SkillBreakdownCardProps) {
  return (
    <section className="ds-list" data-icons="true" aria-labelledby="ins-skills-title">
      <div className="ins-card-head">
        <div className="min-w-0">
          <h3 id="ins-skills-title">Skills</h3>
          <p>Questions in your bank, and how many you have rated</p>
        </div>
      </div>
      {skills.map((skill) => {
        const none = skill.total === 0;
        return (
          <div key={skill.category} className="ds-list-row ins-barrow">
            <span className="ds-icon-tile ds-icon-tile-sm ds-tone-indigo" aria-hidden="true">
              <Icon name={skill.icon} size={16} variant="solid" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="ins-barrow-top">
                <p className="ins-barrow-name">{skill.category}</p>
                <span className="ins-barrow-pct" data-empty={none || undefined}>
                  {none ? 'No questions' : `${skill.accuracy}%`}
                </span>
              </div>
              {!none && (
                <>
                  <p className="ins-barrow-note">
                    {skill.completed} of {skill.total} rated
                  </p>
                  <Bar
                    value={skill.accuracy / 100}
                    tone="jade"
                    label={`${skill.category}: ${skill.completed} of ${skill.total} rated`}
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
