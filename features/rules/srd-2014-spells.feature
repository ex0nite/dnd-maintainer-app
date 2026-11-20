Feature: Spells and spellcasting of the 2014 rules
  As a player of a 2014 campaign who casts spells,
  I want my known and prepared spells, my slots and my pact magic as the 2014 rules give them,
  So that my sheet is right.

  # Story 9.8 (resolver seam). The rules are the generated SRD 5.1 layer of the 2014 edition (CC-BY-4.0).

  Rule: The SRD 5.1 spells are in the 2014 rules, each attached to its classes

    Scenario: The spell list
      Given the 2014 rules
      Then the 2014 rules hold 319 spells
      And the 2014 spell "fireball" is a level 3 spell of the classes "sorcerer, wizard"
      And the 2014 spell "cure-wounds" is a level 1 spell of the classes "bard, cleric, druid, paladin, ranger"
      And the 2014 spell "eldritch-blast" is a level 0 spell of the classes "warlock"

  Rule: Spell slots follow the class table of the SRD

    Scenario Outline: A level <level> <class> has the slots <slots>
      Given a 2014 "<class>" at level <level>
      Then the 2014 sheet has the spell slots "<slots>"

      Examples:
        | class   | level | slots                |
        | wizard  | 1     | 2                    |
        | wizard  | 5     | 4,3,2                |
        | cleric  | 11    | 4,3,3,3,2,1          |
        | bard    | 20    | 4,3,3,3,3,2,2,1,1    |
        | paladin | 1     |                      |
        | paladin | 2     | 2                    |
        | paladin | 5     | 4,2                  |
        | ranger  | 9     | 4,3,2                |

    Scenario: A warlock has pact magic and no other slots
      Given a 2014 "warlock" at level 5
      Then the 2014 sheet has the spell slots ""
      And the 2014 sheet has 2 pact magic slots of level 3
      Given a 2014 "warlock" at level 11
      Then the 2014 sheet has 3 pact magic slots of level 5

  Rule: Spells known, spellbook and prepared spells follow the class

    Scenario: A level 5 wizard keeps a spellbook and prepares spells
      Given a 2014 "wizard" at level 5
      Then the 2014 sheet knows 4 cantrips
      And the 2014 sheet has 14 spells to learn
      And the 2014 sheet prepares 5 spells

    Scenario: A level 5 bard knows its spells and prepares none
      Given a 2014 "bard" at level 5
      Then the 2014 sheet knows 3 cantrips
      And the 2014 sheet has 8 spells to learn
      And the 2014 sheet prepares 0 spells

    Scenario: A level 5 paladin prepares half its level
      Given a 2014 "paladin" at level 5
      Then the 2014 sheet prepares 2 spells

  Rule: Domain and oath spells are always prepared from the level the SRD gives them

    Scenario: A level 5 Life cleric
      Given a 2014 "cleric" at level 5 with the subclass "life"
      Then the 2014 sheet always prepares "bless, cure-wounds, lesser-restoration, spiritual-weapon, beacon-of-hope, revivify"

    Scenario: A level 3 paladin of Devotion
      Given a 2014 "paladin" at level 3 with the subclass "devotion"
      Then the 2014 sheet always prepares "protection-from-evil-and-good, sanctuary"

  Rule: Invocations and metamagic are picked level by level

    Scenario: A level 5 warlock owes three invocations
      Given a 2014 "warlock" at level 5
      Then the 2014 sheet offers 3 options to pick among 32 invocations

    Scenario: A level 3 sorcerer owes two metamagic options
      Given a 2014 "sorcerer" at level 3
      Then the 2014 sheet offers 2 options to pick among 8 invocations
