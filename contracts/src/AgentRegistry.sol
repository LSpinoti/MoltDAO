// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

contract AgentRegistry is Ownable {
    struct AgentProfile {
        address owner;
        string handle;
        bytes32 handleHash;
        bytes32 metadataHash;
        bool verified;
        bool exists;
    }

    mapping(address => AgentProfile) public profiles;
    mapping(bytes32 => address) public handleOwners;

    event AgentRegistered(address indexed agent, address indexed owner, string handle, bytes32 metadataHash);
    event AgentUpdated(address indexed agent, string handle, bytes32 metadataHash, bool verified);

    error InvalidAgent();
    error ProfileAlreadyExists();
    error ProfileNotFound();
    error HandleTaken();
    error Unauthorized();

    constructor(address owner_) Ownable(owner_) {}

    function registerAgent(address agent, string calldata ensOrHandle, bytes32 metadataCIDHash) external {
        if (agent == address(0) || agent != msg.sender) revert InvalidAgent();
        if (profiles[agent].exists) revert ProfileAlreadyExists();

        bytes32 normalizedHandleHash = _handleHash(ensOrHandle);
        address existingOwner = handleOwners[normalizedHandleHash];
        if (existingOwner != address(0)) revert HandleTaken();

        profiles[agent] = AgentProfile({
            owner: msg.sender,
            handle: ensOrHandle,
            handleHash: normalizedHandleHash,
            metadataHash: metadataCIDHash,
            verified: false,
            exists: true
        });

        handleOwners[normalizedHandleHash] = agent;

        emit AgentRegistered(agent, msg.sender, ensOrHandle, metadataCIDHash);
    }

    function updateMetadata(bytes32 metadataCIDHash) external {
        AgentProfile storage profile = profiles[msg.sender];
        if (!profile.exists) revert ProfileNotFound();
        if (profile.owner != msg.sender) revert Unauthorized();

        profile.metadataHash = metadataCIDHash;
        emit AgentUpdated(msg.sender, profile.handle, metadataCIDHash, profile.verified);
    }

    function setHandle(string calldata ensOrHandle) external {
        AgentProfile storage profile = profiles[msg.sender];
        if (!profile.exists) revert ProfileNotFound();
        if (profile.owner != msg.sender) revert Unauthorized();

        bytes32 oldHash = profile.handleHash;
        bytes32 newHash = _handleHash(ensOrHandle);

        address existingOwner = handleOwners[newHash];
        if (existingOwner != address(0) && existingOwner != msg.sender) revert HandleTaken();

        if (oldHash != newHash) {
            delete handleOwners[oldHash];
            handleOwners[newHash] = msg.sender;
        }

        profile.handle = ensOrHandle;
        profile.handleHash = newHash;

        emit AgentUpdated(msg.sender, ensOrHandle, profile.metadataHash, profile.verified);
    }

    function setVerified(address agent, bool verified) external onlyOwner {
        AgentProfile storage profile = profiles[agent];
        if (!profile.exists) revert ProfileNotFound();

        profile.verified = verified;
        emit AgentUpdated(agent, profile.handle, profile.metadataHash, verified);
    }

    function _handleHash(string memory handle) internal pure returns (bytes32) {
        bytes memory normalized = _normalizeHandle(handle);
        if (normalized.length == 0) revert InvalidAgent();
        return keccak256(normalized);
    }

    function _normalizeHandle(string memory input) internal pure returns (bytes memory) {
        bytes memory source = bytes(input);
        bytes memory normalized = new bytes(source.length);

        for (uint256 i = 0; i < source.length; i++) {
            bytes1 char = source[i];
            if (char >= 0x41 && char <= 0x5A) {
                normalized[i] = bytes1(uint8(char) + 32);
            } else {
                normalized[i] = char;
            }
        }

        return normalized;
    }
}
