import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ALLOWED_CONTENT_TYPES } from '../files.service';

export class UploadUrlDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  filename!: string;

  @IsIn(ALLOWED_CONTENT_TYPES as unknown as string[])
  contentType!: string;
}

export class DownloadUrlQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  key!: string;
}
