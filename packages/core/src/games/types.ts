/** 小游戏契约（games capability 的实现形状） */

export interface GameDefinition {
  /** 唯一 id（建议 插件id:game-id 形式，供 PetState.gameProgress 做 key） */
  id: string;
  title: string;
  description?: string;
  /** 最低等级限制（可选） */
  minLevel?: number;
  /** UI widget 入口标识：宿主按此渲染游戏界面 */
  entry: string;
}

/** 一局游戏的宿主句柄：由宿主创建，游戏内部通过其上报分数 */
export interface GameSession {
  game: string;
  /** 上报本局得分（宿主经 PetRuntime 写入 gameProgress 并广播 game:score） */
  reportScore(score: number): void;
  reportCompleted(): void;
  dispose(): void;
}

/** games capability 的实现形状（插件通过 registerCapability({kind:'games'}, impl) 提供） */
export interface GameCapabilityImpl {
  games: GameDefinition[];
  /** 可选：创建游戏会话（UI 层通常直接渲染组件，此接口供无 UI 环境使用） */
  createSession?(gameId: string): GameSession | Promise<GameSession>;
}