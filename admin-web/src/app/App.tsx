import { SessionProvider } from "./session";
import { SessionGate } from "./SessionGate";
export function App() {
  return (
    <SessionProvider>
      <SessionGate />
    </SessionProvider>
  );
}
