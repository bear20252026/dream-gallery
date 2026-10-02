// 导航与对白的边界规则：同一时刻只允许当前世界的主线发言。
export function allowJourneyDialog(current, incoming, world, busy = false) {
  if (incoming.world && incoming.world !== world) return false;
  if (current?.lock && !incoming.lock) return false;
  if (busy && !incoming.lock && !incoming.userInitiated) return false;
  return true;
}

export function guideBearing(player, point) {
  if (!player || !point) return null;
  const dx = point.x - player.p.x, dz = point.z - player.p.z;
  let angle = Math.atan2(-dx, -dz) - (player.y || 0);
  angle = Math.atan2(Math.sin(angle), Math.cos(angle));
  const distance = Math.hypot(dx, dz);
  const direction = distance <= 1.8 ? 'arrived' : Math.abs(angle) > 2.35 ? 'behind' :
    Math.abs(angle) < .3 ? 'forward' : angle > 0 ? 'left' : 'right';
  return { angle, distance, direction };
}

// 国王舞台的平面行走；B612的高度只由原模型地表决定。
export function memoryWalkPosition(point) {
  const radius = 12;
  const r = Math.hypot(point.x, point.z), scale = r > radius ? radius / r : 1;
  return { x: point.x * scale, y: 13 * .42 + 1.6, z: point.z * scale };
}

export function homeCheckpoint(value, memories = []) {
  const ids = new Set(Array.isArray(memories) ? memories.filter(Boolean).map(e => e.id) : []);
  let completed = 0;
  for (const id of ['volcano', 'baobab', 'sunset', 'rose']) { if (!ids.has(id)) break; completed++; }
  return Math.max(completed, Math.min(4, Math.max(0, Math.floor(Number(value) || 0))));
}

export function kingCheckpoint(value, memories = []) {
  const ids = new Set(Array.isArray(memories) ? memories.filter(Boolean).map(e => e.id) : []);
  return Math.max(ids.has('rat') ? 4 : ids.has('almanac') ? 2 : 0, Math.min(5, Math.max(0, Math.floor(Number(value) || 0))));
}
