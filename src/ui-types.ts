// UI 层用到的精简数据类型

export interface SelInfo {
  name: string;
  color: string;
  hp: number;
  maxhp: number;
  ratio: number;
  atk: number;
  interval: number;
  support: boolean;
  block: number | null;
}
