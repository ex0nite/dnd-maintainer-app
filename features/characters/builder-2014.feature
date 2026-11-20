Feature: Character builder of the 2014 rules
  As a player of a 2014 campaign,
  I want a builder that follows the 2014 creation,
  So that I create my sheet without error and without redoing my calculations.

  # Story 9.7 (resolver seam, plus the pure helpers of the builder). The rules are the generated SRD 5.1 layer of the 2014
  # edition (CC-BY-4.0).

  Rule: The steps follow the order of 2014

    Scenario: Species and class, then the scores, then the background, then the equipment
      Given a 2014 campaign
      Then the builder steps are "basics", "class", "abilities", "origin", "details", "equipment", "backstory"

  Rule: The scores are checked against the method that produced them

    Scenario Outline: Scores typed or bought are accepted or refused
      Given the base scores "<scores>" by the method "<method>"
      Then the scores are <verdict>

      Examples:
        | method         | scores               | verdict  |
        | standard-array | 15,14,13,12,10,8     | accepted |
        | standard-array | 15,15,13,12,10,8     | refused  |
        | point-buy      | 15,15,15,8,8,8       | accepted |
        | point-buy      | 15,15,15,15,8,8      | refused  |
        | rolling        | 18,3,10,12,14,9      | accepted |
        | rolling        | 19,3,10,12,14,9      | refused  |
        | manual         | 20,3,10,12,14,9      | accepted |
        | manual         | 21,10,10,10,10,10    | refused  |
        | manual         | 10,10,10,10,10,2     | refused  |

  Rule: The species bonuses are added to the typed scores, and the sheet is computed with the 2014 formulas

    Scenario: A hill dwarf cleric of the Life domain, scores typed by hand
      Given a 2014 "dwarf" with the subspecies "hill-dwarf" and the background "acolyte"
      And the 2014 base scores "14,10,15,8,16,12" typed by hand
      And a level 1 "cleric" with the subclass "life"
      And the 2014 character wears "chain-mail" and "shield"
      When the 2014 character is resolved
      Then the 2014 character has STR 14, CON 17 and WIS 17
      And the 2014 character has 12 hit points, an armor class of 18 and a proficiency bonus of 2
      And the 2014 character has a saving throw bonus of 5 in "wis"
      And the 2014 character has a skill bonus of 5 in "insight"

  Rule: The class gives its starting equipment as choices, and the background its items

    Scenario: A fighter answers the four lines of the SRD
      Given a 2014 "human" with no subspecies and the background "acolyte"
      And a level 1 "fighter"
      When the 2014 character is resolved
      Then the 2014 character still has 4 equipment choices to make
      And the 2014 character carries a holy symbol from the background

  Rule: A subclass belongs to its class

    Scenario: A subclass of another class is not applied
      Given a 2014 "human" with no subspecies and the background "acolyte"
      And a level 3 "fighter" with the subclass "devotion"
      When the 2014 character is resolved
      Then the engine warns that "devotion" does not belong to "fighter"
