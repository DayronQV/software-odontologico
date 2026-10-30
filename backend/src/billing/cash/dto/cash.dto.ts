import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class OpenCashDto {
  /** Fondo inicial de efectivo en caja. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  openingFloat!: number;
}

/** RN-02: el conteo físico es obligatorio y se ingresa ANTES de ver el total del sistema. */
export class CloseCashDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  countedCash!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
