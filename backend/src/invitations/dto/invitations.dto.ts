import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateInvitationDto {
  @IsEmail()
  email!: string;

  /**
   * @IsIn over the three literals rather than @IsEnum(UserRole): the enum is a
   * Prisma-generated value, and importing it into a DTO ties request validation
   * to a regenerated client. Same list users.module.ts validates against.
   */
  @IsIn(['agent', 'lead', 'admin'])
  role!: 'agent' | 'lead' | 'admin';

  @IsOptional()
  @IsUUID()
  teamId?: string;
}

/**
 * Both fields optional HERE and conditionally required in the service.
 *
 * Whether a password is needed depends on whether a Plumo CS account already
 * exists for the invited address — a database question, which class-validator
 * cannot ask. Marking them required would make an existing user unable to accept
 * at all; the service enforces the real rule (see InvitationsService.accept) and
 * the constraints below still hold whenever a value IS supplied.
 */
export class AcceptInvitationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
