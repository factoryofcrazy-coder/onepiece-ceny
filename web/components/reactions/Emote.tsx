// Vlastné pirátske emoty, kreslené priamo v kóde: malé, ostré a bez cudzích obrázkov.
import type { EmoteId } from "@/lib/reactions";
import { emoteLabel } from "@/lib/reactions";

const BONE = "#f4ead2", LINE = "#1d1a2b";

/** Lebka: spoločný základ pre KEK, POG a COPE. */
const Skull = () => (
  <>
    <path d="M16 3C9.200 3 4.500 7.700 4.500 14c0 3.900 1.800 7 4.900 8.800V26a2 2 0 0 0 2 2h9.200a2 2 0 0 0 2-2v-3.200c3.100-1.800 4.900-4.900 4.900-8.800C27.500 7.700 22.800 3 16 3Z" fill={BONE} stroke={LINE} strokeWidth="1.500" />
    <path d="M12.800 24v4M16 24v4M19.200 24v4" stroke={LINE} strokeWidth="1.200" />
  </>
);

const ART: Record<EmoteId, React.ReactNode> = {
  // smiech: privreté oči, široko otvorené ústa, slzy od smiechu
  kek: (
    <>
      <Skull />
      <path d="M8.500 12.500c1.300-1.800 3.700-1.800 5 0M18.500 12.500c1.300-1.800 3.700-1.800 5 0" fill="none" stroke={LINE} strokeWidth="2" strokeLinecap="round" />
      <path d="M10 16h12c0 3.500-2.600 6-6 6s-6-2.500-6-6Z" fill={LINE} />
      <path d="M12.800 17.800c1.900 1.300 4.500 1.300 6.400 0" fill="none" stroke="#e8526b" strokeWidth="1.800" strokeLinecap="round" />
      <path d="M5.500 13.500c-1.600 1.700-2.300 3-2.300 4a1.700 1.700 0 0 0 3.400 0c0-.8-.4-2.200-1.100-4ZM26.500 13.500c1.600 1.700 2.300 3 2.300 4a1.700 1.700 0 0 1-3.400 0c0-.8.4-2.200 1.100-4Z" fill="#59c6f2" />
    </>
  ),
  // údiv: okrúhle oči a ústa
  pog: (
    <>
      <Skull />
      <circle cx="11" cy="12.500" r="3.400" fill={LINE} />
      <circle cx="21" cy="12.500" r="3.400" fill={LINE} />
      <circle cx="12" cy="11.500" r="1.100" fill="#fff" />
      <circle cx="22" cy="11.500" r="1.100" fill="#fff" />
      <ellipse cx="16" cy="19.500" rx="2.400" ry="3" fill={LINE} />
    </>
  ),
  // náhrobok s kotvou
  rip: (
    <>
      <path d="M7 28V13a9 9 0 0 1 18 0v15Z" fill="#8f97ad" stroke={LINE} strokeWidth="1.500" />
      <path d="M3.500 28h25" stroke="#5fae62" strokeWidth="3" strokeLinecap="round" />
      <path d="M16 9v13M12.500 12h7M10.500 17.500c.5 3 2.700 4.500 5.500 4.500s5-1.500 5.500-4.500" fill="none" stroke={LINE} strokeWidth="1.800" strokeLinecap="round" />
      <circle cx="16" cy="8" r="1.500" fill="none" stroke={LINE} strokeWidth="1.400" />
    </>
  ),
  // úsmev so slzou
  cope: (
    <>
      <Skull />
      <circle cx="11" cy="12.500" r="2.700" fill={LINE} />
      <circle cx="21" cy="12.500" r="2.700" fill={LINE} />
      <path d="M11 19c2.800 2.300 7.200 2.300 10 0" fill="none" stroke={LINE} strokeWidth="2" strokeLinecap="round" />
      <path d="M21.500 15.500c-1.500 1.900-2.200 3.200-2.200 4.200a2.200 2.200 0 0 0 4.400 0c0-1-.8-2.300-2.200-4.200Z" fill="#59c6f2" stroke={LINE} strokeWidth=".7" />
    </>
  ),
  // zlatá minca
  beli: (
    <>
      <circle cx="16" cy="16" r="12.500" fill="#f2b84b" stroke={LINE} strokeWidth="1.500" />
      <circle cx="16" cy="16" r="9.300" fill="#ffd778" stroke="#b67d17" strokeWidth="1.200" />
      <path d="M13 9.500v13M13 10h4.200a3 3 0 0 1 0 6H13h5a3.200 3.200 0 0 1 0 6.400h-5M11 13h7M11 19h7" fill="none" stroke="#8a5a08" strokeWidth="1.800" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // žiariaca karta
  pull: (
    <>
      <rect x="8.500" y="5.500" width="15" height="21" rx="2" fill="#7c4dff" stroke={LINE} strokeWidth="1.500" transform="rotate(8 16 16)" />
      <path d="M16.500 10.500l1.700 4 4.200.5-3.200 2.800.9 4.200-3.600-2.200-3.600 2.200.9-4.200-3.200-2.800 4.200-.5Z" fill="#ffd778" stroke={LINE} strokeWidth=".8" strokeLinejoin="round" />
      <path d="M4 7.500l1 2.500 2.500 1-2.500 1-1 2.500-1-2.500L.500 11 3 10ZM27.500 21l.8 1.800 1.800.7-1.800.7-.8 1.800-.8-1.800-1.800-.7 1.800-.7Z" fill="#ffd778" />
    </>
  ),
  // nahnevaná soľnička
  salty: (
    <>
      <path d="M10.500 12h11l2.300 14a2 2 0 0 1-2 2.300H10.200a2 2 0 0 1-2-2.300Z" fill="#eef3f8" stroke={LINE} strokeWidth="1.500" />
      <path d="M11 12c0-4 2-6.500 5-6.500s5 2.500 5 6.500Z" fill="#9aa6bd" stroke={LINE} strokeWidth="1.500" />
      <path d="M12 16.500l3 1.500M20 16.500l-3 1.500" stroke="#d6324b" strokeWidth="2" strokeLinecap="round" />
      <circle cx="13.500" cy="19.800" r="1.200" fill={LINE} />
      <circle cx="18.500" cy="19.800" r="1.200" fill={LINE} />
      <path d="M13 24.800c1.800-1.500 4.200-1.500 6 0" fill="none" stroke={LINE} strokeWidth="1.600" strokeLinecap="round" />
      <path d="M6 5.500h.1M9 2.500h.1M23 3h.1M26 6h.1M16 2h.1" stroke="#eef3f8" strokeWidth="2.200" strokeLinecap="round" />
    </>
  ),
  // skrížené šable
  gg: (
    <>
      <path d="M6 4l15.500 17.500M26 4 10.500 21.500" stroke="#dfe7f2" strokeWidth="3.400" strokeLinecap="round" />
      <path d="M6 4l15.500 17.500M26 4 10.500 21.500" stroke={LINE} strokeWidth=".7" strokeLinecap="round" />
      <path d="M17.800 23.400l5.600-5M14.200 23.400l-5.600-5" stroke="#f2b84b" strokeWidth="3" strokeLinecap="round" />
      <path d="M23 21.500l3 4M9 21.500l-3 4" stroke="#8a5a08" strokeWidth="3.200" strokeLinecap="round" />
    </>
  ),
};

export default function Emote({ id, size = 20 }: { id: EmoteId; size?: number }) {
  return (
    <svg className="emote" viewBox="0 0 32 32" width={size} height={size} role="img" aria-label={emoteLabel(id)}>
      {ART[id]}
    </svg>
  );
}
