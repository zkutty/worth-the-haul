type Props = {
  query: string;
};

export default function MapEmbed({ query }: Props) {
  const src = `https://www.google.com/maps?q=${query}&output=embed`;
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
