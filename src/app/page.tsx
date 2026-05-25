import { redirect } from 'next/navigation';

// Raiz redireciona por role via middleware. Este fallback só roda se a
// pessoa logada não tem role vinculada ainda (RPC link pendente).
export default function Home() {
  redirect('/foco');
}
