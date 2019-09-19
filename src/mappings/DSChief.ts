import { log, BigInt, Bytes, Address, BigDecimal, crypto, EthereumBlock, Value } from '@graphprotocol/graph-ts'

import { LogNote, DSChief, Etch } from '../../generated/DSChief/DSChief'
import { DSSpell } from '../../generated/DSChief/DSSpell'
import { DSSpell as DSSpellTemplate } from '../../generated/templates'
import { AddressVoter, VoteProxy, Action, Slate, Spell, GovernanceInfo, VotingAction } from '../../generated/schema'

import {BIGINT_ONE, BIGINT_ZERO, BIGDECIMAL_ZERO, toBigDecimal, fromBigDecimalToBigInt, isSaiMom, getGovernanceInfoEntity, updateGovernanceInfoEntity, toAddress } from '../helpers'

export function handleLock(event: LogNote): void {
  let sender = event.params.guy.toHex()
  let locked = toBigDecimal(event.params.foo)

  let voteProxy = VoteProxy.load(sender)
  let addressVoter = AddressVoter.load(sender)

  let votedSlate: string

  let governanceInfo = getGovernanceInfoEntity()

  if (voteProxy != null) {
    voteProxy.locked = voteProxy.locked.plus(locked)
    voteProxy.save()

    votedSlate = voteProxy.votedSlate
  } else if (addressVoter != null) {
    addressVoter.locked = addressVoter.locked.plus(locked)
    addressVoter.save()

    votedSlate = addressVoter.votedSlate
  } else {
    addressVoter = new AddressVoter(sender)
    addressVoter.locked = locked
    addressVoter.timestamp = event.block.timestamp
    addressVoter.save()

    let action = new Action(
      event.transaction.hash.toHex() + '-' + event.logIndex.toString() + 'ADDRESS-VOTER',
    )
    action.type = 'VOTER'
    action.voterAddress = event.params.guy
    action.timestamp = event.block.timestamp
    action.save()

    governanceInfo.countAddresses = governanceInfo.countAddresses.plus(BIGINT_ONE)
  }

  governanceInfo.locked = governanceInfo.locked.plus(locked)

  let action = new Action(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )
  action.type = 'LOCK'
  action.sender = event.params.guy
  action.wad = locked
  action.transactionHash = event.transaction.hash
  action.timestamp = event.block.timestamp
  action.save()

  if (votedSlate !== null) {
    let slate = Slate.load(votedSlate)
    handleVotingAction((slate.yays as Bytes[]), event, fromBigDecimalToBigInt(locked), 'LOCK', 'LOCK')
  }

  governanceInfo.countLock = governanceInfo.countLock.plus(BIGINT_ONE)

  updateGovernanceInfoEntity(event.block, governanceInfo)
}

export function handleFree(event: LogNote): void {
  let sender = event.params.guy.toHex()
  let free = toBigDecimal(event.params.foo)

  let voteProxy = VoteProxy.load(sender)
  let addressVoter = AddressVoter.load(sender)

  let votedSlate: string

  if (voteProxy != null) {
    voteProxy.locked = voteProxy.locked.minus(free)
    voteProxy.save()

    votedSlate = voteProxy.votedSlate
  } else if (addressVoter != null) {
    addressVoter.locked = addressVoter.locked.minus(free)
    addressVoter.save()

    votedSlate = addressVoter.votedSlate
  } else {
    log.error('handleFree: No VoteProxy nor addressVoter id {} found.', [sender])
    return
  }

  let governanceInfo = getGovernanceInfoEntity()
  governanceInfo.locked = governanceInfo.locked.minus(free)

  let action = new Action(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )
  action.type = 'FREE'
  action.sender = event.params.guy
  action.wad = free
  action.transactionHash = event.transaction.hash
  action.timestamp = event.block.timestamp
  action.save()

  if (votedSlate !== null) {
    let slate = Slate.load(votedSlate)
    handleVotingAction((slate.yays as Bytes[]), event, fromBigDecimalToBigInt(free), 'FREE', 'FREE')
  }

  governanceInfo.countFree = governanceInfo.countFree.plus(BIGINT_ONE)

  updateGovernanceInfoEntity(event.block, governanceInfo)
}

export function handleVote(event: LogNote): void {
  let sender = event.params.guy
  let slateID = event.params.foo

  let dsChief = DSChief.bind(event.address)
  let locked = dsChief.deposits(sender)

  handleSlate(slateID, event.address, event.block)

  let slate = Slate.load(slateID.toHex())
  let voteProxy = VoteProxy.load(sender.toHex())
  let addressVoter = AddressVoter.load(sender.toHex())

  if (slate == null) {
    log.error('handleVote: Slate with id {} not found.', [slateID.toHex()])
    return
  }

  let newYays = new Array<string>()
  for (let index = 0; index < slate.yays.length; index++) {
    let yay = (slate.yays as Bytes[])[index]
    if (yay !== null) {
      newYays.push(yay.toHexString())
    }
  }
  let prevVotedSlateId: string

  if (voteProxy != null) {
    prevVotedSlateId = voteProxy.votedSlate
    voteProxy.votedSlate = slate.id
    voteProxy.save()
  } else if (addressVoter != null) {
    prevVotedSlateId = addressVoter.votedSlate
    addressVoter.votedSlate = slate.id
    addressVoter.save()
  } else {
    log.error('handleVote: No VoteProxy nor addressVoter id {} found.', [sender.toHex()])
    return
  }

  let prevVotedSlate = Slate.load(prevVotedSlateId)
  let prevYays = new Array<string>()
  for (let index = 0; index < prevVotedSlate.yays.length; index++) {
    let yay = (prevVotedSlate.yays as Bytes[])[index]
    if (yay !== null) {
      prevYays.push(yay.toHexString())
    }
  }

  let addedYays = new Array<Bytes>()
  if (newYays !== null) {
    for (let index = 0; index < newYays.length; index++) {
      let yay = (newYays as string[])[index]
      if (yay !== null) {
        if (prevYays.indexOf(yay) == -1) {
          addedYays.push(Bytes.fromHexString((yay as string)) as Bytes)
        }
      }
    }
  }

  handleVotingAction(addedYays, event, locked, 'ADD', 'ADD')

  let removedYays = new Array<Bytes>()
  if (prevYays != null) {
    for (let index = 0; index < prevYays.length; index++) {
      let yay = (prevYays as string[])[index]
      if (yay !== null) {
        if (newYays.indexOf(yay) == -1) {
          removedYays.push(Bytes.fromHexString((yay as string)) as Bytes)
        }
      }
    }
  }

  handleVotingAction(removedYays, event, locked, 'REMOVE', 'REMOVE')

  let action = new Action(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )
  action.type = 'VOTE'
  action.sender = sender
  action.yays = slate.yays
  action.transactionHash = event.transaction.hash
  action.timestamp = event.block.timestamp
  action.save()

  updateGovernanceInfoEntity(event.block)
}

export function handleVoteArray(event: LogNote): void {
  let sender = event.params.guy
  let dsChief = DSChief.bind(event.address)
  let slateID = dsChief.votes(sender)
  let locked = dsChief.deposits(sender)

  handleSlate(slateID, event.address, event.block)

  let slate = Slate.load(slateID.toHex())
  let voteProxy = VoteProxy.load(sender.toHex())
  let addressVoter = AddressVoter.load(sender.toHex())

  if (slate == null) {
    log.error('handleVote: Slate with id {} not found.', [slateID.toHex()])
    return
  }

  let newYays = new Array<string>()
  for (let index = 0; index < slate.yays.length; index++) {
    let yay = (slate.yays as Bytes[])[index]
    if (yay !== null) {
      newYays.push(yay.toHexString())
    }
  }
  let prevVotedSlateId: string

  if (voteProxy != null) {
    prevVotedSlateId = voteProxy.votedSlate
    voteProxy.votedSlate = slate.id
    voteProxy.save()
  } else if (addressVoter != null) {
    prevVotedSlateId = addressVoter.votedSlate
    addressVoter.votedSlate = slate.id
    addressVoter.save()
  } else {
    log.error('handleVote: No VoteProxy nor addressVoter id {} found.', [sender.toHex()])
    return
  }

  let prevVotedSlate = Slate.load(prevVotedSlateId)
  let prevYays = new Array<string>()
  for (let index = 0; index < prevVotedSlate.yays.length; index++) {
    let yay = (prevVotedSlate.yays as Bytes[])[index]
    if (yay !== null) {
      prevYays.push(yay.toHexString())
    }
  }

  let addedYays = new Array<Bytes>()
  if (newYays !== null) {
    for (let index = 0; index < newYays.length; index++) {
      let yay = (newYays as string[])[index]
      if (yay !== null) {
        if (prevYays.indexOf(yay) == -1) {
          addedYays.push(Bytes.fromHexString((yay as string)) as Bytes)
        }
      }
    }
  }

  handleVotingAction(addedYays, event, locked, 'ADD-ARRAY', 'ADD')

  let removedYays = new Array<Bytes>()
  if (prevYays != null) {
    for (let index = 0; index < prevYays.length; index++) {
      let yay = (prevYays as string[])[index]
      if (yay !== null) {
        if (newYays.indexOf(yay) == -1) {
          let test = Bytes.fromHexString((yay as string)) as Bytes
          log.error('handleVoteArray REMOVE yay {} trans {}', [yay, test.toHexString()])
          removedYays.push(Bytes.fromHexString((yay as string)) as Bytes)
        }
      }
    }
  }

  handleVotingAction(removedYays, event, locked, 'REMOVE-ARRAY', 'REMOVE')

  let action = new Action(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )
  action.type = 'VOTE'
  action.sender = sender
  action.yays = slate.yays
  action.transactionHash = event.transaction.hash
  action.timestamp = event.block.timestamp
  action.save()

  updateGovernanceInfoEntity(event.block)
}

export function handleEtch(event: Etch): void {
  let slateID = event.params.slate

  handleSlate(slateID, event.address, event.block)

  let action = new Action(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )
  action.type = 'ETCH'
  action.sender = event.transaction.from
  action.transactionHash = event.transaction.hash
  action.timestamp = event.block.timestamp
  action.save()
}

function handleSlate(slateID: Bytes, chiefAddress: Address, block: EthereumBlock, governanceInfo: GovernanceInfo = getGovernanceInfoEntity()): void {
  if (Slate.load(slateID.toHex()) != null) {
    return
  }

  let slate = new Slate(slateID.toHex())
  slate.yays = new Array<Bytes>()
  slate.timestamp = block.timestamp

  let dsChief = DSChief.bind(chiefAddress)

  let i = 0
  let slateResponse = dsChief.try_slates(slateID, BigInt.fromI32(i))

  while (!slateResponse.reverted) {
    let spellAddress = slateResponse.value
    let spell = Spell.load(spellAddress.toHexString())

    // FIXME - Remove address blacklist check once https://github.com/graphprotocol/support/issues/30 gets fixed
    if (spell == null && (
      spellAddress.toHex() != '0x483574d869bc34d2131032e65a3114a901928e91' &&
      spellAddress.toHex() != '0xe7bbc8fea57a92fc307d650d78e5481b25ccedff'
    )) {
      spell = new Spell(spellAddress.toHexString())
      spell.timestamp = block.timestamp
      spell.approvals = BIGINT_ZERO
      spell.totalVotes = BIGINT_ZERO
      spell.timeLineCount = BIGINT_ZERO


      let dsSpell = DSSpell.bind(spellAddress)
      let dsResponse = dsSpell.try_whom()

      if (!dsResponse.reverted && isSaiMom(dsResponse.value)) {
        // Start traking this DS-Spell
        DSSpellTemplate.create(spellAddress)
        // Update spells count
        governanceInfo.countSpells = governanceInfo.countSpells.plus(BIGINT_ONE)

        spell.save()
      }
    }
    // Save slate's yay (even if it isn't a spell)
    slate.yays = slate.yays.concat([spellAddress])
    slateResponse = dsChief.try_slates(slateID, BigInt.fromI32(++i))
  }

  slate.save()

  governanceInfo.countSlates = governanceInfo.countSlates.plus(BIGINT_ONE)
  updateGovernanceInfoEntity(block, governanceInfo)
}

export function handleLift(event: LogNote): void {
  let sender = event.params.guy
  let whom = toAddress(event.params.foo)
  let dsChief = DSChief.bind(event.address)

  let spellEntity = Spell.load(whom.toHexString())
  let approval = dsChief.approvals(whom)

  // How much MKR it has when the spell is lifted to hat
  spellEntity.lifted = event.block.timestamp
  spellEntity.liftedWith = approval
  spellEntity.save()

  let governanceInfo = getGovernanceInfoEntity()
  governanceInfo.hat = whom
  governanceInfo.save()

  let action = new Action(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  )
  action.type = 'LIFT'
  action.sender = sender
  action.hat = whom
  action.transactionHash = event.transaction.hash
  action.timestamp = event.block.timestamp
  action.save()

  updateGovernanceInfoEntity(event.block)
}

function handleVotingAction(yays: Bytes[], event: LogNote, locked: BigInt, id: string, type: string): void {
  let sender = event.params.guy

  for (let index = 0; index < yays.length; index++) {
    let yay = (yays as Bytes[])[index]
    if (yay !== null) {
      let spell = Spell.load(yay.toHexString())

      // there are some yays which are no spell
      if (spell !== null) {
        let voteAction = new VotingAction(
          event.transaction.hash.toHex() + '-' + id + '-' + event.logIndex.toString(),
        )

        voteAction.type = type
        voteAction.sender = sender
        voteAction.spell = yay.toHexString()
        if (type == 'ADD' || type == 'REMOVE') {
          voteAction.locked = locked
          spell.totalVotes = spell.totalVotes.plus(BIGINT_ONE)
        } else { // LOCK or FREE
          voteAction.wad = locked
        }
        voteAction.transactionHash = event.transaction.hash
        voteAction.timestamp = event.block.timestamp
        voteAction.save()


        spell.approvals = spell.approvals.plus(locked)
        spell.timeLineCount = spell.timeLineCount.plus(BIGINT_ONE)
        spell.save()
      }
    }
  }
}
