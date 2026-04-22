import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyTokenDto {
    @IsString()
    @IsNotEmpty()
    idToken!: string;
}
