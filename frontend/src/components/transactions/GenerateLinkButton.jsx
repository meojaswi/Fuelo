import Button from "../shared/Button";
export default function GenerateLinkButton({ onClick, loading }) {
  return (
    <Button variant="secondary" loading={loading} onClick={onClick}>
      Generate one-time link
    </Button>
  );
}
