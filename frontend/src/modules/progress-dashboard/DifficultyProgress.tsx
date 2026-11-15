interface DifficultyLevel {
  level: string;
  attempted: number;
  correct: number;
  accuracy: number;
  color: string;
}

interface DifficultyProgressCardProps {
  difficulties: DifficultyLevel[];
}

export default function DifficultyProgressCard({
  difficulties,
}: DifficultyProgressCardProps) {
  return (
    <div className="rounded-[20px] border mix-border-foreground/[0.07] bg-card p-4 shadow-card sm:p-24">
      <h3 className="font-heading text-lg font-medium text-foreground mb-24">
        Difficulty Progression
      </h3>
      <div className="space-y-24">
        {difficulties.map((difficulty) => (
          <div key={difficulty.level}>
            <div className="flex items-center justify-between mb-12">
              <div className="flex items-center gap-12">
                <div
                  className="w-12 h-12 rounded-full"
                  style={{ backgroundColor: difficulty.color }}
                />
                <span className="text-sm font-medium text-foreground">
                  {difficulty.level}
                </span>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">
                  {difficulty.accuracy}%
                </p>
                <p className="text-xs text-muted-foreground font-caption">
                  {difficulty.correct}/{difficulty.attempted}
                </p>
              </div>
            </div>
            <div className="h-8 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full transition-smooth"
                style={{
                  width: `${difficulty.accuracy}%`,
                  backgroundColor: difficulty.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}