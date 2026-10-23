import { useEffect, useMemo, useState } from "react";
import { cardImageCandidates } from "../../lib/pokemon/card-images";

export function DeckCardThumb({
  name,
  setCode,
  number,
  qty,
  size = 96,
}: {
  name: string;
  setCode?: string;
  number?: string;
  qty?: number;
  size?: number;
}) {
  const candidates = useMemo(() => cardImageCandidates(setCode, number), [setCode, number]);
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setIdx(0);
    setFailed(false);
  }, [setCode, number, name]);

  const src = !failed ? candidates[idx] : undefined;
  const code =
    setCode && number ? `${setCode}-${number}` : setCode || number || "";

  return (
    <div
      style={{
        width: size,
        position: "relative",
        flex: "0 0 auto",
      }}
      title={`${qty ? `${qty}× ` : ""}${name}${code ? ` (${code})` : ""}`}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          loading="lazy"
          style={{
            width: size,
            height: size * 1.4,
            objectFit: "cover",
            borderRadius: 6,
            display: "block",
            background: "var(--card)",
            border: "1px solid var(--border)",
          }}
          onError={() => {
            setIdx((i) => {
              if (i + 1 < candidates.length) return i + 1;
              setFailed(true);
              return i;
            });
          }}
        />
      ) : (
        <div
          style={{
            width: size,
            height: size * 1.4,
            fontSize: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: 4,
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--card)",
            lineHeight: 1.2,
          }}
        >
          {name}
          {code ? (
            <>
              <br />
              <span style={{ opacity: 0.7 }}>{code}</span>
            </>
          ) : null}
        </div>
      )}
      {qty != null && qty > 0 ? (
        <span
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            minWidth: 22,
            height: 22,
            padding: "0 5px",
            borderRadius: 999,
            background: "rgba(0,0,0,0.8)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ×{qty}
        </span>
      ) : null}
    </div>
  );
}
