// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";
import {IStakeVault} from "./interfaces/IStakeVault.sol";
import {IReputation} from "./interfaces/IReputation.sol";
import {IActionExecutor} from "./interfaces/IActionExecutor.sol";

contract Forum is Ownable, Pausable {
    enum PostType {
        DISCUSSION,
        ACTION
    }

    struct Post {
        uint256 id;
        address author;
        bytes32 contentHash;
        PostType postType;
        uint256 actionId;
        bytes actionRef;
        uint64 createdAt;
    }

    struct Comment {
        uint256 id;
        uint256 parentPostId;
        address author;
        bytes32 contentHash;
        uint64 createdAt;
    }

    struct Vote {
        bool voted;
        bool support;
        uint256 stakeAmount;
    }

    IStakeVault public immutable stakeVault;
    IReputation public immutable reputation;
    IActionExecutor public immutable actionExecutor;

    uint256 public nextPostId = 1;
    uint256 public nextCommentId = 1;

    mapping(uint256 => Post) public posts;
    mapping(uint256 => Comment) public comments;
    mapping(uint256 => mapping(address => Vote)) public actionVotes;

    event PostCreated(
        uint256 indexed postId,
        address indexed author,
        uint8 postType,
        bytes32 contentHash,
        uint256 indexed actionId,
        bytes actionRef
    );
    event CommentCreated(uint256 indexed commentId, uint256 indexed parentPostId, address indexed author, bytes32 contentHash);
    event ActionVoted(uint256 indexed actionId, address indexed voter, bool support, uint256 stakeAmount);

    error InvalidPostType();
    error InvalidContentHash();
    error PostNotFound();
    error InsufficientBond();
    error InvalidActionRef();
    error AlreadyVoted();

    constructor(address owner_, address stakeVault_, address reputation_, address actionExecutor_) Ownable(owner_) {
        require(stakeVault_ != address(0), "stakeVault");
        require(reputation_ != address(0), "reputation");
        require(actionExecutor_ != address(0), "actionExecutor");

        stakeVault = IStakeVault(stakeVault_);
        reputation = IReputation(reputation_);
        actionExecutor = IActionExecutor(actionExecutor_);
    }

    function createPost(bytes32 contentHash, uint8 postType, bytes calldata actionRef)
        external
        whenNotPaused
        returns (uint256 postId)
    {
        if (contentHash == bytes32(0)) revert InvalidContentHash();
        if (postType > uint8(PostType.ACTION)) revert InvalidPostType();

        uint256 actionId = 0;

        if (PostType(postType) == PostType.DISCUSSION) {
            if (stakeVault.availableBalance(msg.sender) < stakeVault.postBondMin()) revert InsufficientBond();
        } else {
            if (stakeVault.availableBalance(msg.sender) < stakeVault.actionBondMin()) revert InsufficientBond();
            if (actionRef.length == 0) revert InvalidActionRef();

            actionId = abi.decode(actionRef, (uint256));
            if (!actionExecutor.actionExists(actionId)) revert InvalidActionRef();
        }

        postId = nextPostId;
        nextPostId += 1;

        posts[postId] = Post({
            id: postId,
            author: msg.sender,
            contentHash: contentHash,
            postType: PostType(postType),
            actionId: actionId,
            actionRef: actionRef,
            createdAt: uint64(block.timestamp)
        });

        if (actionId != 0) {
            actionExecutor.attachPost(actionId, postId, msg.sender);
        }

        reputation.recordPost(msg.sender, true);

        emit PostCreated(postId, msg.sender, postType, contentHash, actionId, actionRef);
    }

    function comment(uint256 postId, bytes32 contentHash) external whenNotPaused returns (uint256 commentId) {
        if (contentHash == bytes32(0)) revert InvalidContentHash();
        if (posts[postId].id == 0) revert PostNotFound();

        commentId = nextCommentId;
        nextCommentId += 1;

        comments[commentId] = Comment({
            id: commentId,
            parentPostId: postId,
            author: msg.sender,
            contentHash: contentHash,
            createdAt: uint64(block.timestamp)
        });

        emit CommentCreated(commentId, postId, msg.sender, contentHash);
    }

    function voteAction(uint256 actionId, bool support, uint256 /* stakeAmount */ ) external whenNotPaused {
        if (!actionExecutor.actionExists(actionId)) revert InvalidActionRef();
        if (actionVotes[actionId][msg.sender].voted) revert AlreadyVoted();

        uint256 stakeAmount = stakeVault.availableBalance(msg.sender);
        if (stakeAmount == 0) revert InsufficientBond();

        actionVotes[actionId][msg.sender] = Vote({voted: true, support: support, stakeAmount: stakeAmount});

        actionExecutor.recordVote(actionId, msg.sender, support, stakeAmount);

        emit ActionVoted(actionId, msg.sender, support, stakeAmount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
