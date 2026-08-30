import TransactionCard from "./TransactionCard";
export default function TransactionCardList({ transactions = [] }) {
  return (
    <div className="space-y-2 md:hidden">
      {transactions.map((t) => (
        <TransactionCard key={t._id || t.id} transaction={t} />
      ))}
    </div>
  );
}
