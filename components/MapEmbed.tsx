type Props = {
  query: string;
  name?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  address?: string;
};

export default function MapEmbed({ name, lat, lng, placeId, address }: Props) {
  const hasCoordinates = lat !== undefined && lng !== undefined;
  if (!hasCoordinates) {
    const link = placeId || address ? new URL("https://www.google.com/maps/search/") : null;
    if (link) {
      link.searchParams.set("api", "1");
      link.searchParams.set("query", [name, address].filter(Boolean).join(", "));
      if (placeId) link.searchParams.set("query_place_id", placeId);
    }
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
        <p>Map location unknown: Google did not supply complete coordinates.</p>
        {link && <a className="mt-2 inline-block underline" href={link.toString()} target="_blank" rel="noopener noreferrer">Open resolved destination in Google Maps</a>}
      </div>
    );
  }
  const src = `https://www.google.com/maps?q=${lat},${lng}(${encodeURIComponent(name ?? "")})&z=15&output=embed`;
  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ borderColor: "var(--border)" }}
    >
      <iframe
        src={src}
        className="h-64 w-full"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        title={`Google map of ${name ?? "resolved destination"}`}
      />
    </div>
  );
}
