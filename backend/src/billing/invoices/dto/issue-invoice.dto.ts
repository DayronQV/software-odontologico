import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod, RetentionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class InvoiceLineInputDto {
  /** Procedimiento del catálogo. Sin él, la línea es libre y requiere descripción y precio. */
  @IsOptional()
  @IsUUID()
  procedureId?: string;

  @ValidateIf((line: InvoiceLineInputDto) => !line.procedureId)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  description?: string;

  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;

  /** Por defecto, el precio base del procedimiento. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  unitPrice?: number;

  /** Descuento sobre la línea. Por encima del máximo configurado lo debe autorizar el administrador. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercent?: number;
}

export class PaymentInputDto {
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000_000)
  amount!: number;

  /** Número de transferencia o autorización del seguro. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;

  /** Token de tarjeta de la pasarela (nunca el número). Pruebas: `tok_declined` la rechaza. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  cardToken?: string;
}

export class RetentionInputDto {
  @IsEnum(RetentionType)
  type!: RetentionType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  percent!: number;
}

export class IssueInvoiceDto {
  @IsUUID()
  patientId!: string;

  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @ApiProperty({ type: () => [InvoiceLineInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineInputDto)
  lines!: InvoiceLineInputDto[];

  /** Pagos mixtos: efectivo, tarjeta, transferencia, seguro. Su suma debe igualar el total a cobrar. */
  @ApiProperty({ type: () => [PaymentInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => PaymentInputDto)
  payments!: PaymentInputDto[];

  @ApiProperty({ type: () => [RetentionInputDto], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => RetentionInputDto)
  retentions?: RetentionInputDto[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class VoidInvoiceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason!: string;
}
