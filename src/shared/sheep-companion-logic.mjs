// 同伴只生活在已经建成的回忆世界；现实中的羊仍留在箱里。
const MEMORIES = new Set(['b612', 'king325', 'king326', 'king327', 'king328', 'king329', 'king330']);
export function sheepVisible(world, drawn) {
  return !!drawn && MEMORIES.has(world);
}

export function sheepTarget(player) {
  const yaw = player.y || 0;
  return {
    x: player.p.x + Math.cos(yaw) * 1.25 - Math.sin(yaw) * 0.6,
    z: player.p.z - Math.sin(yaw) * 1.25 - Math.cos(yaw) * 0.6,
  };
}

// 移动而非每帧贴到角色坐标；转镜头时不会立即绕玩家滑动。
export function stepSheep(position, target, dt) {
  const distance = Math.hypot(target.x - position.x, target.z - position.z);
  const speed = distance > 3 ? 4.2 : 2.3;
  const travel = Math.min(Math.max(0, distance - 0.35), speed * Math.min(0.05, Math.max(0, dt)));
  return {
    x: position.x + (distance ? ((target.x - position.x) / distance) * travel : 0),
    z: position.z + (distance ? ((target.z - position.z) / distance) * travel : 0),
    travel,
    yaw: distance ? Math.atan2(target.x - position.x, target.z - position.z) : null,
    catchUp: distance > 8,
  };
}
