import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const StatTile = ({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  tone?: "warning";
}) => {
  const tile = (
    <Card className={cn("h-full gap-1 py-3.5 [--card-spacing:--spacing(4)]", href && "hover:ring-foreground/15 transition-shadow hover:shadow-sm")}>
      <CardHeader className="gap-1.5">
        <CardDescription className="text-xs font-medium">{label}</CardDescription>
        <CardTitle
          className={cn(
            "text-3xl font-semibold tabular-nums",
            tone === "warning" && value !== 0 && "text-destructive",
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
      {hint ? <CardContent className="text-muted-foreground text-xs">{hint}</CardContent> : null}
    </Card>
  );
  return href ? (
    <Link href={href} className="rounded-xl focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]">
      {tile}
    </Link>
  ) : (
    tile
  );
};
