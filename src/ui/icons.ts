import * as Phaser from 'phaser';
import damageUrl from '../../assets/interface_icons/hud_icons/png/damage_cost_64.png';
import bankUrl from '../../assets/interface_icons/hud_icons/png/bank_balance_64.png';
import footprintUrl from '../../assets/interface_icons/hud_icons/png/footprint_64.png';
import houseUrl from '../../assets/interface_icons/hud_icons/png/house_value_64.png';
import repairUrl from '../../assets/interface_icons/hud_icons/png/repair_cost_64.png';

/** HUD icons (assets/interface_icons), shown at this size. The 64 px files keep them sharp when the canvas is scaled up. */
export const ICON_SIZE = 40;

export type IconKey = 'icon-footprint' | 'icon-bank' | 'icon-house' | 'icon-repair' | 'icon-damage';

const URLS: Record<IconKey, string> = {
  'icon-footprint': footprintUrl,
  'icon-bank': bankUrl,
  'icon-house': houseUrl,
  'icon-repair': repairUrl,
  'icon-damage': damageUrl,
};

export function preloadIcons(scene: Phaser.Scene): void {
  for (const [key, url] of Object.entries(URLS)) scene.load.image(key, url);
}
