import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPump } from "../../api/pump.api";
import { useAuth } from "../../context/AuthContext";
import { FuelLabel, LevelBadge, TankGraphic } from "./TankGauge";
import { levelText } from "./tankColors";

// Compact tank levels for the Dashboard. Only for workspaces that manage tanks.
export default function TankStrip() {
  const { user } = useAuth();
  const workspaceId = user?.workspaceId;
  const enabled = Boolean(
    user?.verticalFeatures?.tanks && user?.permissions?.includes("tanks:manage")
  );
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    getPump("/tanks")
      .then((data) => {
        if (active)
          setResult({ workspaceId, tanks: data.tanks.filter((tank) => tank.isActive !== false) });
      })
      .catch(() => {
        if (active) setResult({ workspaceId, tanks: [] });
      });
    return () => {
      active = false;
    };
  }, [enabled, workspaceId]);

  const tanks = result?.workspaceId === workspaceId ? result.tanks : [];
  if (!enabled || !tanks.length) return null;
  return (
    <section aria-labelledby="tank-levels-title">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="mono-label">Tank levels</p>
          <h3 id="tank-levels-title" className="mt-1 font-bold">
            Stock in your tanks
          </h3>
        </div>
        <Link
          to="/pump/tanks"
          className="inline-flex min-h-11 items-center text-xs font-semibold text-slate-500 hover:text-slate-900"
        >
          Manage tanks
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tanks.map((tank) => (
          <Link
            key={tank._id}
            to="/pump/tanks"
            className="panel flex min-w-0 items-center gap-3 p-3 hover:border-slate-300"
          >
            <TankGraphic tank={tank} width={34} />
            <span className="min-w-0 space-y-1">
              <span className="block truncate text-sm font-semibold">{tank.name}</span>
              <FuelLabel itemType={tank.itemType} />
              <span className="block text-xs text-slate-600">{levelText(tank)}</span>
              <LevelBadge tank={tank} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
