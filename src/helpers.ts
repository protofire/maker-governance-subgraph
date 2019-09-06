import { Address, BigDecimal, BigInt, Bytes } from '@graphprotocol/graph-ts'
import { GovernanceInfo } from '../generated/schema'

let PRECISION = BigDecimal.fromString('1000000000000000000') // 10^18
let SAI_MOM = '0xf2c5369cffb8ea6284452b0326e326dbfdcb867c'

export let BIGINT_ONE = BigInt.fromI32(1)
export let BIGINT_ZERO = BigInt.fromI32(0)
export let BIGDECIMAL_ZERO = BigDecimal.fromString("0")


export function toAddress(value: Bytes): Address {
  return Address.fromHexString(value.toHex()).subarray(-20) as Address
}

export function toBigInt(value: Bytes, bigEndian: boolean = true): BigInt {
  let val = bigEndian ? (value.reverse() as Bytes) : value

  return BigInt.fromUnsignedBytes(val)
}

export function toBigDecimal(value: Bytes, bigEndian: boolean = true): BigDecimal {
  let val = toBigInt(value, bigEndian)

  return val.divDecimal(PRECISION)
}

export function isSaiMom(value: Address): bool {
  return value.toHex() == SAI_MOM
}

export function getGovernanceInfoEntity(): GovernanceInfo {
  let id = '0x0'
  let entity = GovernanceInfo.load(id)

  if (entity == null) {
    entity = new GovernanceInfo(id)
    entity.countVoters = BIGINT_ZERO
    entity.countSlates = BIGINT_ZERO
    entity.countSpells = BIGINT_ZERO
    entity.countPolls = BIGINT_ZERO
    entity.locked = BIGDECIMAL_ZERO
    entity.lastBlock = BIGINT_ZERO
  }

  return entity as GovernanceInfo
}
