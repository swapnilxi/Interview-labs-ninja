import Icon from '@/components/ui/AppIcon';

interface SkillData {
  category: string;
  completed: number;
  total: number;
  accuracy: number;
  icon: string;
}

interface SkillBreakdownCardProps {
  skills: SkillData[];
}

export default function SkillBreakdownCard({ skills }: SkillBreakdownCardProps) {
  return (
    <div className="rounded-[20px] border mix-border-foreground/[0.07] bg-card p-4 shadow-card sm:p-24">
      <div className="flex items-center gap-12 mb-24">
        <Icon name="ChartBarIcon" size={20} variant="outline" />
        <h3 className="font-heading text-lg font-medium text-foreground">
          Skill Breakdown
        </h3>
      </div>
      <div className="space-y-18">
        {skills.map((skill) => {
          const progress = (skill.completed / skill.total) * 100;
          return (
            <div key={skill.category} className="space-y-12">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-12">
                  <div className="w-36 h-36 rounded-md bg-primary/20 flex items-center justify-center">
                    <Icon name={skill.icon as any} size={18} variant="outline" className="text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {skill.category}
                    </p>
                    <p className="text-xs text-muted-foreground font-caption">
                      {skill.completed}/{skill.total} completed
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {skill.accuracy}%
                  </p>
                  <p className="text-xs text-muted-foreground font-caption">
                    accuracy
                  </p>
                </div>
              </div>
              <div className="h-6 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-secondary transition-smooth"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}