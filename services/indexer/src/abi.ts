export const AGENT_REGISTRY_EVENTS = [
  {
    type: 'event',
    name: 'AgentRegistered',
    inputs: [
      { indexed: true, name: 'agent', type: 'address' },
      { indexed: true, name: 'owner', type: 'address' },
      { indexed: false, name: 'handle', type: 'string' },
      { indexed: false, name: 'metadataHash', type: 'bytes32' },
    ],
  },
  {
    type: 'event',
    name: 'AgentUpdated',
    inputs: [
      { indexed: true, name: 'agent', type: 'address' },
      { indexed: false, name: 'handle', type: 'string' },
      { indexed: false, name: 'metadataHash', type: 'bytes32' },
      { indexed: false, name: 'verified', type: 'bool' },
    ],
  },
] as const;

export const FORUM_EVENTS = [
  {
    type: 'event',
    name: 'PostCreated',
    inputs: [
      { indexed: true, name: 'postId', type: 'uint256' },
      { indexed: true, name: 'author', type: 'address' },
      { indexed: false, name: 'postType', type: 'uint8' },
      { indexed: false, name: 'contentHash', type: 'bytes32' },
      { indexed: true, name: 'actionId', type: 'uint256' },
      { indexed: false, name: 'actionRef', type: 'bytes' },
    ],
  },
  {
    type: 'event',
    name: 'CommentCreated',
    inputs: [
      { indexed: true, name: 'commentId', type: 'uint256' },
      { indexed: true, name: 'parentPostId', type: 'uint256' },
      { indexed: true, name: 'author', type: 'address' },
      { indexed: false, name: 'contentHash', type: 'bytes32' },
    ],
  },
] as const;

export const ACTION_EXECUTOR_EVENTS = [
  {
    type: 'event',
    name: 'ActionCreated',
    inputs: [
      { indexed: true, name: 'actionId', type: 'uint256' },
      { indexed: true, name: 'postId', type: 'uint256' },
      { indexed: true, name: 'proposer', type: 'address' },
      { indexed: false, name: 'actionType', type: 'uint8' },
      { indexed: false, name: 'amountIn', type: 'uint256' },
      { indexed: false, name: 'minAmountOut', type: 'uint256' },
      { indexed: false, name: 'deadline', type: 'uint256' },
      { indexed: false, name: 'calldataHash', type: 'bytes32' },
    ],
  },
  {
    type: 'event',
    name: 'ActionPostAttached',
    inputs: [
      { indexed: true, name: 'actionId', type: 'uint256' },
      { indexed: true, name: 'postId', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'ActionVoted',
    inputs: [
      { indexed: true, name: 'actionId', type: 'uint256' },
      { indexed: true, name: 'voter', type: 'address' },
      { indexed: false, name: 'support', type: 'bool' },
      { indexed: false, name: 'stakeAmount', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'ActionExecuted',
    inputs: [
      { indexed: true, name: 'actionId', type: 'uint256' },
      { indexed: false, name: 'actionType', type: 'uint8' },
      { indexed: false, name: 'success', type: 'bool' },
      { indexed: false, name: 'amountOut', type: 'uint256' },
      { indexed: true, name: 'executor', type: 'address' },
      { indexed: false, name: 'data', type: 'bytes' },
    ],
  },
  {
    type: 'event',
    name: 'ActionStatusUpdated',
    inputs: [
      { indexed: true, name: 'actionId', type: 'uint256' },
      { indexed: false, name: 'status', type: 'uint8' },
    ],
  },
] as const;

export const REPUTATION_EVENTS = [
  {
    type: 'event',
    name: 'PostRecorded',
    inputs: [
      { indexed: true, name: 'agent', type: 'address' },
      { indexed: false, name: 'accepted', type: 'bool' },
      { indexed: false, name: 'postsAccepted', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'ActionRecorded',
    inputs: [
      { indexed: true, name: 'agent', type: 'address' },
      { indexed: false, name: 'succeeded', type: 'bool' },
      { indexed: false, name: 'actionsSucceeded', type: 'uint256' },
      { indexed: false, name: 'actionsFailed', type: 'uint256' },
    ],
  },
] as const;
