// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract IdentityManagement {
    struct Identity {
        string name;
        string email;
        string docHash;
        bool isVerified;
        address owner;
        bool exists;
    }

    address public admin;
    mapping(address => Identity) private identities;

    event IdentityRegistered(address indexed user, string name, string email, string docHash);
    event ProfileUpdated(address indexed user, string name, string email, string docHash);
    event IdentityVerified(address indexed user);
    event IdentityRevoked(address indexed user);
    event IdentityRemoved(address indexed user);

    constructor() {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    function registerIdentity(string memory _name, string memory _email, string memory _docHash) public {
        require(!identities[msg.sender].exists, "Already registered");
        _validate(_name, _email, _docHash);

        identities[msg.sender] = Identity({
            name: _name,
            email: _email,
            docHash: _docHash,
            isVerified: false,
            owner: msg.sender,
            exists: true
        });

        emit IdentityRegistered(msg.sender, _name, _email, _docHash);
    }

    function updateProfile(string memory _name, string memory _email, string memory _docHash) public {
        require(identities[msg.sender].exists, "Not registered");
        _validate(_name, _email, _docHash);

        Identity storage id = identities[msg.sender];
        id.name = _name;
        id.email = _email;

        if (keccak256(bytes(id.docHash)) != keccak256(bytes(_docHash))) {
            id.docHash = _docHash;
            id.isVerified = false;
        }

        emit ProfileUpdated(msg.sender, _name, _email, id.docHash);
    }

    function verifyIdentity(address _user) public onlyAdmin {
        require(identities[_user].exists, "Not registered");
        identities[_user].isVerified = true;
        emit IdentityVerified(_user);
    }

    function revokeIdentity(address _user) public {
        require(identities[_user].exists, "Not registered");
        require(msg.sender == admin || msg.sender == identities[_user].owner, "Not allowed");
        identities[_user].isVerified = false;
        emit IdentityRevoked(_user);
    }

    function removeIdentity(address _user) public onlyAdmin {
        require(identities[_user].exists, "Not registered");
        delete identities[_user];
        emit IdentityRemoved(_user);
    }

    function getIdentity(address _user)
        public
        view
        returns (string memory name, string memory email, string memory docHash, bool isVerified, address owner, bool exists)
    {
        Identity memory id = identities[_user];
        return (id.name, id.email, id.docHash, id.isVerified, id.owner, id.exists);
    }

    function _validate(string memory _name, string memory _email, string memory _docHash) private pure {
        require(bytes(_name).length >= 2, "Name required");
        require(bytes(_email).length > 3, "Email required");
        require(bytes(_docHash).length > 0, "Document required");
    }
}
