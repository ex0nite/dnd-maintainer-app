Feature: Classes and subclasses of the 2014 rules
  As a player of a 2014 campaign,
  I want the classes with their 2014 rules,
  So that my level, my features and my subclass are right.

  # Story 9.6 (resolver seam). The rules are the generated SRD 5.1 layer of the 2014 edition (CC-BY-4.0).

  Rule: The subclass is asked at the class level of the 2014 rules

    Scenario Outline: The subclass choice opens at class level <asked_at>
      Given a 2014 "<class>" at level <before>
      Then the 2014 sheet offers no subclass
      Given a 2014 "<class>" at level <asked_at>
      Then the 2014 sheet offers the subclass of the "<class>" to choose

      Examples:
        | class     | before | asked_at |
        | cleric    | 0      | 1        |
        | sorcerer  | 0      | 1        |
        | warlock   | 0      | 1        |
        | druid     | 1      | 2        |
        | wizard    | 1      | 2        |
        | barbarian | 2      | 3        |
        | bard      | 2      | 3        |
        | fighter   | 2      | 3        |
        | monk      | 2      | 3        |
        | paladin   | 2      | 3        |
        | ranger    | 2      | 3        |
        | rogue     | 2      | 3        |

  Rule: Ability score improvements come at the levels of the class, and there is no weapon mastery

    Scenario: A fighter has seven improvements and a rogue six
      Given a 2014 "fighter" at level 20
      Then the 2014 sheet offers 7 ability score improvements
      And the 2014 sheet has no weapon mastery
      Given a 2014 "rogue" at level 20
      Then the 2014 sheet offers 6 ability score improvements

    Scenario: A fighter improvement comes at level 6, a barbarian one does not
      Given a 2014 "fighter" at level 6
      Then the 2014 sheet offers 2 ability score improvements
      Given a 2014 "barbarian" at level 6
      Then the 2014 sheet offers 1 ability score improvements

  Rule: The class gives its 2014 saving throws, skills, proficiencies and hit points

    Scenario: A level 5 cleric
      Given a 2014 "cleric" at level 5
      Then the 2014 sheet has proficiency in the saving throws "wis" and "cha"
      And the 2014 sheet has a hit die of 8 and 28 hit points
      And the 2014 sheet has a proficiency bonus of 3
      And the 2014 sheet offers 2 skills to choose among 5

    Scenario: A level 3 champion
      Given a 2014 "fighter" at level 3 with the subclass "champion"
      Then the 2014 sheet has the features "second-wind", "action-surge-1-use" and "improved-critical"
