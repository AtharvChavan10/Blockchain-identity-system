// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

contract IdentityManagement{

    struct Identity{
        string name;
        string email;
        string docHash;
        bool isVerifed;
        address owner;
    }

    address admin;
    mapping(address => Identity) public identities;

    event register(address indexed user, string name, string email);
    event verify(address indexed user);
    event remove(address indexed user);

    constructor()
    {
        admin = msg.sender;
    }

    modifier OnlyAdmin()
    {
        require(msg.sender == admin, "You are not an admin");
        _;
    }

    modifier OnlyOnwer()
    {
        require(identities[msg.sender].owner == msg.sender, "Not your Identity");
        _;
    }

    function registerIdentity(string memory _name, string memory _email, string memory _docHash) public {

        identities[msg.sender] = Identity({
            name: _name,
            email: _email,
            docHash: _docHash,
            isVerifed: false,
            owner: msg.sender
        });

        emit register(msg.sender, _name, _email);
    }

    function verifyIdentity(address _user) public OnlyAdmin {
        identities[_user].isVerifed = true;

        emit verify(_user);
    }

    function removeIdentity(address _user) public OnlyOnwer {
        identities[_user].isVerifed = false;

        emit remove(_user);
    }

    function getIdentities(address _user) public view returns (string memory, string memory, string memory, bool, address){
        Identity memory id = identities[_user];
        return(id.name, id.email, id.docHash, id.isVerifed, id.owner);
    }
}