export enum SparePartCategory {
  DISPLAY_OLED = 'DISPLAY_OLED',
  DISPLAY_LCD = 'DISPLAY_LCD',
  BATTERY = 'BATTERY',
  CHARGING_FLEX = 'CHARGING_FLEX',
  CAMERA_MODULE = 'CAMERA_MODULE',
  SMD_COMPONENT = 'SMD_COMPONENT',
  IC = 'IC',
  OTHER = 'OTHER',
}

// BE-17: kardex movement types.
export enum StockMovementType {
  IN = 'IN',
  RESERVE = 'RESERVE',
  RELEASE = 'RELEASE',
  OUT = 'OUT',
  ADJUSTMENT = 'ADJUSTMENT',
}
