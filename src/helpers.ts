import {
  Address,
  BigDecimal,
  BigInt,
  Bytes,
  EthereumBlock,
} from '@graphprotocol/graph-ts'

import {
  DssDecember6Spell as DssDecember6SpellDataSource,
  DssFlopReplaceSpell as DssFlopReplaceSpellDataSource,
  DssLaunchSpell as DssLaunchSpellDataSource,
} from '../generated/templates'

import { GovernanceInfo } from '../generated/schema'

import {
  DSS_DECEMBER_6_SPELL,
  DSS_FLOP_REPLACE_SPELL,
  DSS_LAUNCH_SPELL,
} from './constants'

let PRECISION = BigDecimal.fromString('1000000000000000000') // 10^18
let SAI_MOM = '0xf2c5369cffb8ea6284452b0326e326dbfdcb867c'

export let BIGINT_ONE = BigInt.fromI32(1)
export let BIGINT_ZERO = BigInt.fromI32(0)
export let BIGDECIMAL_ZERO = BigDecimal.fromString('0')

export function toAddress(value: Bytes): Address {
  return Address.fromHexString(value.toHex()).subarray(-20) as Address
}

export function toBigInt(value: Bytes, bigEndian: boolean = true): BigInt {
  let val = bigEndian ? (value.reverse() as Bytes) : value

  return BigInt.fromUnsignedBytes(val)
}

export function fromBigDecimalToBigInt(value: BigDecimal): BigInt {
  return value.times(PRECISION).digits
}

export function fromBigIntToBigDecimal(value: BigInt): BigDecimal {
  return value.divDecimal(PRECISION)
}

export function toBigDecimal(value: Bytes, bigEndian: boolean = true): BigDecimal {
  let val = toBigInt(value, bigEndian)

  return val.divDecimal(PRECISION)
}

export function isSaiMom(value: Address): boolean {
  return value.toHex() == SAI_MOM
}

export function getGovernanceInfoEntity(): GovernanceInfo {
  let id = '0x0'
  let entity = GovernanceInfo.load(id)

  if (entity == null) {
    entity = new GovernanceInfo(id)
    entity.countProxies = BIGINT_ZERO
    entity.countAddresses = BIGINT_ZERO
    entity.countSlates = BIGINT_ZERO
    entity.countSpells = BIGINT_ZERO
    entity.countLock = BIGINT_ZERO
    entity.countFree = BIGINT_ZERO
    entity.countPolls = BIGINT_ZERO
    entity.countCasted = BIGINT_ZERO
    entity.locked = BIGDECIMAL_ZERO
    entity.lastBlock = BIGINT_ZERO
    entity.lastSynced = BIGINT_ZERO
  }

  return entity as GovernanceInfo
}

export function updateGovernanceInfoEntity(
  block: EthereumBlock,
  governanceInfo: GovernanceInfo = getGovernanceInfoEntity(),
): void {
  if (governanceInfo == null) {
    governanceInfo = getGovernanceInfoEntity()
  }
  governanceInfo.lastBlock = block.number
  governanceInfo.lastSynced = block.timestamp
  governanceInfo.save()
}

export function isCustomSpellContract(spellAddress: Address): boolean {
  let CUSTOM_DSS_SPELL_CONTRACTS: string[] = [
    DSS_LAUNCH_SPELL,
    DSS_FLOP_REPLACE_SPELL,
    DSS_DECEMBER_6_SPELL,
  ]

  return CUSTOM_DSS_SPELL_CONTRACTS.includes(spellAddress.toHexString())
}

export function createCustomSpellDataSource(spellAddress: Address): void {
  let addr = spellAddress.toHexString()

  // TODO: use a generic handler for all these contracts
  if (addr == DSS_LAUNCH_SPELL) {
    DssLaunchSpellDataSource.create(spellAddress)
  } else if (addr == DSS_FLOP_REPLACE_SPELL) {
    DssFlopReplaceSpellDataSource.create(spellAddress)
  } else if (addr == DSS_DECEMBER_6_SPELL) {
    DssDecember6SpellDataSource.create(spellAddress)
  }
}
