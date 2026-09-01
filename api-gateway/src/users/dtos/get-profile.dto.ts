import { PublicUserDto } from './profile.dto'

/**
 * Same public representation shared with the auth module; extending it keeps a
 * distinct schema name for this operation in the OpenAPI document.
 */
export class GetProfileResponseDto extends PublicUserDto {}
