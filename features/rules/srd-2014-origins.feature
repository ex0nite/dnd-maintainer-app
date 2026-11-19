Feature: Species, subspecies and backgrounds of the 2014 rules
  As a player of a 2014 campaign,
  I want species with their ability bonuses and traits, and backgrounds without bonuses,
  So that my character follows the rules my table plays.

  # Story 9.5 (resolver seam). The rules are the generated SRD 5.1 layer of the 2014 edition (CC-BY-4.0).

  Rule: Species and subspecies add up, the background gives no bonus

    Scenario: A character of a 2014 campaign with a species, a subspecies and a background
      Given a character of a 2014 campaign with base abilities of 10
      And the species "dwarf" with the subspecies "hill-dwarf"
      And the background "acolyte"
      When the 2014 sheet is resolved
      Then the 2014 character has CON 12 and WIS 11 and every other ability at 10
      And the 2014 character walks 25 feet and is of size "medium"
      And the 2014 character speaks "common" and "dwarvish"
      And the 2014 character is resistant to "poison"
      And the 2014 character has the traits "darkvision", "dwarven-toughness" and "acolyte-shelter-of-the-faithful"
      And the 2014 character is proficient in "insight" and "religion"
      And the 2014 character is offered no feat and no ability score choice

    Scenario: A subspecies of another species is not applied
      Given a character of a 2014 campaign with base abilities of 10
      And the species "dwarf" with the subspecies "high-elf"
      When the 2014 sheet is resolved
      Then the 2014 character has CON 12 and every other ability at 10
      And the engine warns about the lineage "high-elf"
