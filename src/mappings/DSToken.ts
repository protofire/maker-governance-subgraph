import { BigDecimal, Bytes, EthereumEvent } from '@graphprotocol/graph-ts'

import { Burn, Mint, Transfer } from '../../generated/GovernanceToken/DSToken'

import {
  Account,
  AccountBalance,
  AccountBalanceSnapshot,
  BurnEvent,
  MintEvent,
  TransferEvent,
} from '../../generated/schema'

import { BIGDECIMAL_ZERO, fromBigIntToBigDecimal } from '../helpers'

const GENESIS_ADDRESS = '0x0000000000000000000000000000000000000000'

export function handleBurn(event: Burn): void {
  let amount = fromBigIntToBigDecimal(event.params.wad)

  // Persist burn event log
  let eventEntity = createBurnEvent(event, amount, event.params.guy)
  eventEntity.save()

  // Update source account balance
  let account = getOrCreateAccount(event.params.guy)

  let accountBalance = decreaseAccountBalance(account, event.address, amount)
  accountBalance.block = event.block.number
  accountBalance.modified = event.block.timestamp
  accountBalance.transaction = event.transaction.hash

  account.save()
  accountBalance.save()

  // To provide information about evolution of account balances
  saveAccountBalanceSnapshot(accountBalance, eventEntity.id, event)
}

export function handleMint(event: Mint): void {
  let amount = fromBigIntToBigDecimal(event.params.wad)

  // Persist mint event log
  let eventEntity = createMintEvent(event, amount, event.params.guy)
  eventEntity.save()

  // Update destination account balance
  let account = getOrCreateAccount(event.params.guy)

  let accountBalance = increaseAccountBalance(account, event.address, amount)
  accountBalance.block = event.block.number
  accountBalance.modified = event.block.timestamp
  accountBalance.transaction = event.transaction.hash

  account.save()
  accountBalance.save()

  // To provide information about evolution of account balances
  saveAccountBalanceSnapshot(accountBalance, eventEntity.id, event)
}

export function handleTransfer(event: Transfer): void {
  let isBurn = event.params.to.toHex() == GENESIS_ADDRESS
  let isMint = event.params.from.toHex() == GENESIS_ADDRESS
  let isTransfer = !(isBurn || isMint)

  let amount = fromBigIntToBigDecimal(event.params.value)

  // Update token event logs
  let eventEntityId: string

  if (isBurn) {
    let eventEntity = createBurnEvent(event, amount, event.params.from)
    eventEntity.save()

    eventEntityId = eventEntity.id
  } else if (isMint) {
    let eventEntity = createMintEvent(event, amount, event.params.to)
    eventEntity.save()

    eventEntityId = eventEntity.id
  } else if (isTransfer) {
    let eventEntity = createTransferEvent(
      event,
      amount,
      event.params.from,
      event.params.to,
    )

    eventEntity.save()

    eventEntityId = eventEntity.id
  }

  // Updates balances of accounts
  if (isTransfer || isBurn) {
    let sourceAccount = getOrCreateAccount(event.params.from)

    let accountBalance = decreaseAccountBalance(sourceAccount, event.address, amount)
    accountBalance.block = event.block.number
    accountBalance.modified = event.block.timestamp
    accountBalance.transaction = event.transaction.hash

    sourceAccount.save()
    accountBalance.save()

    // To provide information about evolution of account balances
    saveAccountBalanceSnapshot(accountBalance, eventEntityId, event)
  }

  if (isTransfer || isMint) {
    let destinationAccount = getOrCreateAccount(event.params.to)

    let accountBalance = increaseAccountBalance(destinationAccount, event.address, amount)
    accountBalance.block = event.block.number
    accountBalance.modified = event.block.timestamp
    accountBalance.transaction = event.transaction.hash

    destinationAccount.save()
    accountBalance.save()

    // To provide information about evolution of account balances
    saveAccountBalanceSnapshot(accountBalance, eventEntityId, event)
  }
}

function createBurnEvent(
  event: EthereumEvent,
  amount: BigDecimal,
  burner: Bytes,
): BurnEvent {
  let eventEntityId = event.transaction.hash.toHex() + '-' + event.logIndex.toString()

  let eventEntity = new BurnEvent(eventEntityId)
  eventEntity.token = event.address
  eventEntity.amount = amount
  eventEntity.sender = event.transaction.from
  eventEntity.burner = burner

  eventEntity.block = event.block.number
  eventEntity.timestamp = event.block.timestamp
  eventEntity.transaction = event.transaction.hash

  return eventEntity
}

function createMintEvent(
  event: EthereumEvent,
  amount: BigDecimal,
  destination: Bytes,
): MintEvent {
  let eventEntityId = event.transaction.hash.toHex() + '-' + event.logIndex.toString()

  let eventEntity = new MintEvent(eventEntityId)
  eventEntity.token = event.address
  eventEntity.amount = amount
  eventEntity.sender = event.transaction.from
  eventEntity.destination = destination
  eventEntity.minter = event.transaction.from

  eventEntity.block = event.block.number
  eventEntity.timestamp = event.block.timestamp
  eventEntity.transaction = event.transaction.hash

  return eventEntity
}

function createTransferEvent(
  event: EthereumEvent,
  amount: BigDecimal,
  source: Bytes,
  destination: Bytes,
): TransferEvent {
  let eventEntityId = event.transaction.hash.toHex() + '-' + event.logIndex.toString()

  let eventEntity = new TransferEvent(eventEntityId)
  eventEntity.token = event.address
  eventEntity.amount = amount
  eventEntity.sender = source
  eventEntity.source = source
  eventEntity.destination = destination

  eventEntity.block = event.block.number
  eventEntity.timestamp = event.block.timestamp
  eventEntity.transaction = event.transaction.hash

  return eventEntity
}

export function getOrCreateAccount(accountAddress: Bytes): Account {
  let accountId = accountAddress.toHex()
  let existingAccount = Account.load(accountId)

  if (existingAccount != null) {
    return existingAccount as Account
  }

  let newAccount = new Account(accountId)
  newAccount.address = accountAddress

  return newAccount
}

function getOrCreateAccountBalance(account: Account, token: Bytes): AccountBalance {
  let balanceId = account.id + '-' + token.toHexString()
  let previousBalance = AccountBalance.load(balanceId)

  if (previousBalance != null) {
    return previousBalance as AccountBalance
  }

  let newBalance = new AccountBalance(balanceId)
  newBalance.account = account.id
  newBalance.token = token
  newBalance.amount = BIGDECIMAL_ZERO

  return newBalance
}

export function increaseAccountBalance(
  account: Account,
  token: Bytes,
  amount: BigDecimal,
): AccountBalance {
  let balance = getOrCreateAccountBalance(account, token)
  balance.amount = balance.amount.plus(amount)

  return balance
}

export function decreaseAccountBalance(
  account: Account,
  token: Bytes,
  amount: BigDecimal,
): AccountBalance {
  let balance = getOrCreateAccountBalance(account, token)
  balance.amount = balance.amount.minus(amount)

  return balance
}

export function saveAccountBalanceSnapshot(
  balance: AccountBalance,
  eventId: string,
  event: EthereumEvent,
): void {
  let snapshot = new AccountBalanceSnapshot(
    balance.id + '-' + event.block.timestamp.toString(),
  )
  snapshot.account = balance.account
  snapshot.token = balance.token
  snapshot.amount = balance.amount

  snapshot.block = event.block.number
  snapshot.transaction = event.transaction.hash
  snapshot.timestamp = event.block.timestamp

  snapshot.event = eventId

  snapshot.save()
}
