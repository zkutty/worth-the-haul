type Props = {
  query: string;
  name?: string;
  lat?: number;
  lng?: number;
};

export default function MapEmbed({ query, name, lat, lng }: Props) {
  const src =
    lat !== undefined && lng !== undefined
      ? `https://www.google.com/maps?q=${lat},${lng}(${encodeURIComponent(
          name ?? ""
        )})&z=15&output=embed`
      : `https://www.google.com/maps?q=${query}&output=embed`;
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
        title="Map"
      />
    </div>
  );
}
