// Ťažký bot rozmýšľa v samostatnom vlákne, aby stránka počas jeho výpočtu nezamŕzala.
import { botAction, BotLevel } from "./bot";
import type { GameState, P } from "./types";

self.onmessage = (e: MessageEvent<{ id: number; s: GameState; me: P; level: BotLevel }>) => {
  const { id, s, me, level } = e.data;
  try {
    self.postMessage({ id, action: botAction(s, me, level) });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
