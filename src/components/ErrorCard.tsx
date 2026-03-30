export default function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
      <h3 className="font-bold text-red-700">{title}</h3>
      <p className="text-red-600">{message}</p>
    </div>
  );
}
