import { SessionProvider } from "./SessionContext";
import { SessionGate } from "./SessionGate";
export function App() {
  return (
    <SessionProvider>
      <SessionGate />
    </SessionProvider>
  );
}
