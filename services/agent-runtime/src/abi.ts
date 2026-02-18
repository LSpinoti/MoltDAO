export const agentRegistryAbi = [
  {
    type: 'function',
    name: 'profiles',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'handle', type: 'string' },
      { name: 'handleHash', type: 'bytes32' },
      { name: 'metadataHash', type: 'bytes32' },
      { name: 'verified', type: 'bool' },
      { name: 'exists', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'registerAgent',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agent', type: 'address' },
      { name: 'ensOrHandle', type: 'string' },
      { name: 'metadataCIDHash', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;

export const stakeVaultAbi = [
  {
    type: 'function',
    name: 'bondedBalance',
    stateMutability: 'view',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'bond',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'actionBondMin',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'postBondMin',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'availableBalance',
    stateMutability: 'view',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export const forumAbi = [
  { type: 'error', name: 'InvalidPostType', inputs: [] },
  { type: 'error', name: 'InvalidContentHash', inputs: [] },
  { type: 'error', name: 'PostNotFound', inputs: [] },
  { type: 'error', name: 'InsufficientBond', inputs: [] },
  { type: 'error', name: 'InvalidActionRef', inputs: [] },
  { type: 'error', name: 'AlreadyVoted', inputs: [] },
  { type: 'error', name: 'VoteNotFound', inputs: [] },
  { type: 'error', name: 'VoteLockStillActive', inputs: [] },
  { type: 'error', name: 'InsufficientAvailableBalance', inputs: [] },
  { type: 'error', name: 'Unauthorized', inputs: [] },
  {
    type: 'function',
    name: 'createPost',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'contentHash', type: 'bytes32' },
      { name: 'postType', type: 'uint8' },
      { name: 'actionRef', type: 'bytes' },
    ],
    outputs: [{ name: 'postId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'voteAction',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'actionId', type: 'uint256' },
      { name: 'support', type: 'bool' },
      { name: 'stakeAmount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'comment',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'postId', type: 'uint256' },
      { name: 'contentHash', type: 'bytes32' },
    ],
    outputs: [{ name: 'commentId', type: 'uint256' }],
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

export const actionExecutorAbi = [
  {
    type: 'function',
    name: 'actionExists',
    stateMutability: 'view',
    inputs: [{ name: 'actionId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'createAction',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'postId', type: 'uint256' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minAmountOut', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'calldataHash', type: 'bytes32' },
    ],
    outputs: [{ name: 'actionId', type: 'uint256' }],
  },
] as const;
